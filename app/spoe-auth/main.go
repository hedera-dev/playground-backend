package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	paseto "aidanwoods.dev/go-paseto/v2"

	"github.com/negasus/haproxy-spoe-go/action"
	"github.com/negasus/haproxy-spoe-go/agent"
	"github.com/negasus/haproxy-spoe-go/logger"
	"github.com/negasus/haproxy-spoe-go/request"
)

/*
Environment variables:

PASETO_V4_PUBLIC_KEY_HEX   (required)   -> Ed25519 public key (32 bytes) in HEX
MODE                       (optional)   -> "http" (default) or "spoe"
LISTEN_ADDR                (optional)   -> ":9000" (spoe) / ":8080" (http)
IGNORE_EXP                 (optional)   -> "true" to ignore exp/nbf validation (like your Node.js)
REQUIRE_AUD                (optional)   -> expected audience
REQUIRE_ISS                (optional)   -> expected issuer
USER_FIELD                 (optional)   -> claim to extract user id ("userId" default, fallback to "sub")
ADMIN_API_KEY              (optional)   -> bypass when X-API-Key (HTTP) or api_key (SPOE arg) matches
AUTH_ARG                   (optional)   -> SPOE arg name with the token (default "auth")
API_KEY_ARG                (optional)   -> SPOE arg name with api key (default "api_key")
MESSAGE_NAME               (optional)   -> SPOE message name (default "verify")
DEBUG                      (optional)   -> "true" to enable debug logging
*/

var debugMode bool

func debugLog(format string, args ...interface{}) {
	if debugMode {
		log.Printf("[DEBUG] "+format, args...)
	}
}

type Verifier struct {
	pub          paseto.V4AsymmetricPublicKey
	ignoreExp    bool
	requireAud   string
	requireIss   string
	accountField string
}

func newVerifier(pubHex string, ignoreExp bool, aud, iss, accountField string) (*Verifier, error) {
	b, err := hex.DecodeString(strings.TrimSpace(pubHex))
	if err != nil || len(b) != 32 {
		return nil, errors.New("invalid ed25519 public key hex")
	}
	pub, err := paseto.NewV4AsymmetricPublicKeyFromBytes(b)
	if err != nil {
		return nil, fmt.Errorf("public key parse: %w", err)
	}
	if strings.TrimSpace(accountField) == "" {
		accountField = "accountId"
	}
	return &Verifier{
		pub:          pub,
		ignoreExp:    ignoreExp,
		requireAud:   aud,
		requireIss:   iss,
		accountField: accountField,
	}, nil
}

// verifyToken returns the extracted accountID if valid, otherwise error
func (v *Verifier) verifyToken(token string) (string, error) {
	debugLog("verifyToken called with token length: %d", len(token))
	token = strings.TrimSpace(token)
	if strings.HasPrefix(strings.ToLower(token), "bearer ") {
		token = strings.TrimSpace(token[7:])
	}
	debugLog("cleaned token length: %d", len(token))
	parser := paseto.NewParserWithoutExpiryCheck() // generic parser

	if !v.ignoreExp {
		parser.AddRule(paseto.NotExpired())
		parser.AddRule(paseto.ValidAt(time.Now()))
	}

	if v.requireAud != "" {
		parser.AddRule(paseto.ForAudience(v.requireAud))
	}
	if v.requireIss != "" {
		parser.AddRule(paseto.IssuedBy(v.requireIss))
	}

	tok, err := parser.ParseV4Public(v.pub, token, nil)
	if err != nil {
		debugLog("token verification failed: %v", err)
		return "", err
	}
	debugLog("token verification successful")

	// Extract accountId (or sub)
	acc := ""
	if v.accountField != "" {
		if val, err := tok.GetString(v.accountField); err == nil && val != "" {
			acc = strings.TrimSpace(val)
		}
	}
	if acc == "" {
		if val, err := tok.GetString("sub"); err == nil && val != "" {
			acc = strings.TrimSpace(val)
		}
	}
	if acc == "" {
		return "", errors.New("missing accountId/sub")
	}
	return acc, nil
}

/* -------------------------
   HTTP mode (for quick tests)
   ------------------------- */

func startHTTP(v *Verifier, addr, adminAPIKey string) error {
	if strings.TrimSpace(addr) == "" {
		addr = ":8080"
	}
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// /check replicates your Node.js middleware behavior
	mux.HandleFunc("/check", func(w http.ResponseWriter, r *http.Request) {
		debugLog("HTTP check request from %s", r.RemoteAddr)
		
		// Admin API key bypass
		if adminAPIKey != "" && r.Header.Get("X-API-Key") == adminAPIKey {
			debugLog("Admin API key bypass successful")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true,"bypass":"api_key"}`))
			return
		}

		// Authorization header OR session cookie
		auth := r.Header.Get("Authorization")
		if auth == "" {
			if c, err := r.Cookie("session"); err == nil && c != nil {
				auth = "Bearer " + c.Value
				debugLog("Using session cookie for authentication")
			}
		}
		if auth == "" {
			debugLog("No authentication token found")
			http.Error(w, `{"message":"Invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		if _, err := v.verifyToken(auth); err != nil {
			debugLog("Token verification failed: %v", err)
			http.Error(w, `{"message":"Invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		debugLog("HTTP authentication successful")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	log.Printf("HTTP auth server listening on %s", addr)
	return http.ListenAndServe(addr, mux)
}

/* -------------------------
   SPOE mode (HAProxy agent)
   ------------------------- */

type spoeSettings struct {
	messageName string // default "verify"
	authArg     string // default "auth"
	apiKeyArg   string // default "api_key"
	adminAPIKey string
}

func startSPOE(v *Verifier, addr string, s spoeSettings) error {
	if strings.TrimSpace(addr) == "" {
		addr = ":9000"
	}
	if s.messageName == "" {
		s.messageName = "verify"
	}
	if s.authArg == "" {
		s.authArg = "auth"
	}
	if s.apiKeyArg == "" {
		s.apiKeyArg = "api_key"
	}

	handler := func(req *request.Request) {
		debugLog("SPOE: Processing request")
		mes, err := req.Messages.GetByName(s.messageName)
		if err != nil {
			log.Printf("SPOE: Message not found: %v", err)
			req.Actions.SetVar(action.ScopeTransaction, "auth_ok", false)
			req.Actions.SetVar(action.ScopeTransaction, "reason", "message_not_found")
			return
		}
		debugLog("SPOE: Message found: %s", s.messageName)
		
		// Log received arguments in debug mode only
		if debugMode {
			debugLog("SPOE: Received arguments:")
			if auth, ok := mes.KV.Get("auth"); ok {
				debugLog("SPOE:   auth = %v", auth)
			}
			if apiKey, ok := mes.KV.Get("api_key"); ok {
				debugLog("SPOE:   api_key = %v", apiKey)
			}
			if cookie, ok := mes.KV.Get("cookie"); ok {
				debugLog("SPOE:   cookie = %v", cookie)
			}
			if method, ok := mes.KV.Get("method"); ok {
				debugLog("SPOE:   method = %v", method)
			}
			if path, ok := mes.KV.Get("path"); ok {
				debugLog("SPOE:   path = %v", path)
			}
			if host, ok := mes.KV.Get("host"); ok {
				debugLog("SPOE:   host = %v", host)
			}
		}

		// Admin API key bypass (SPOE arg)
		if s.adminAPIKey != "" {
			if vRaw, ok := mes.KV.Get(s.apiKeyArg); ok {
				if apiKey, ok2 := vRaw.(string); ok2 && apiKey == s.adminAPIKey {
					debugLog("SPOE: Admin API key bypass successful")
					req.Actions.SetVar(action.ScopeTransaction, "auth_ok", true)
					req.Actions.SetVar(action.ScopeTransaction, "reason", "bypass_api_key")
					return
				}
			}
		}

		// Try to get token from Authorization header first
		var token string
		var tokenSource string
		
		// 1. Try Authorization header
		if vRaw, ok := mes.KV.Get(s.authArg); ok {
			if authToken, ok2 := vRaw.(string); ok2 && strings.TrimSpace(authToken) != "" {
				// Extract Bearer token
				if strings.HasPrefix(authToken, "Bearer ") {
					token = strings.TrimPrefix(authToken, "Bearer ")
					tokenSource = "bearer_header"
				}
			}
		}
		
		// 2. Try session cookie if no Bearer token found
		if token == "" {
			if cookieRaw, ok := mes.KV.Get("cookie"); ok {
				if cookieStr, ok2 := cookieRaw.(string); ok2 && cookieStr != "" {
					// Parse cookies to find hedera-portal-session
					cookies := parseCookies(cookieStr)
					if sessionToken, exists := cookies["hedera-portal-session"]; exists && sessionToken != "" {
						token = sessionToken
						tokenSource = "session_cookie"
					}
				}
			}
		}
		
		if token == "" {
			debugLog("SPOE: No valid token found in Authorization header or hedera-portal-session cookie")
			req.Actions.SetVar(action.ScopeTransaction, "auth_ok", false)
			req.Actions.SetVar(action.ScopeTransaction, "reason", "missing_token")
			return
		}
		
		debugLog("SPOE: Token found from %s, length: %d", tokenSource, len(token))

		userId, err := v.verifyToken(token)
		if err != nil {
			debugLog("SPOE: Token verification failed: %v", err)
			req.Actions.SetVar(action.ScopeTransaction, "auth_ok", false)
			req.Actions.SetVar(action.ScopeTransaction, "reason", err.Error())
			return
		}

		debugLog("SPOE: Token verification successful, user_id: %s", userId)
		req.Actions.SetVar(action.ScopeTransaction, "auth_ok", true)
		req.Actions.SetVar(action.ScopeTransaction, "user_id", userId)
		req.Actions.SetVar(action.ScopeTransaction, "reason", "ok")
	}

	l, err := net.Listen("tcp4", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer l.Close()

	a := agent.New(handler, logger.NewDefaultLog())
	log.Printf("SPOA listening on %s", addr)
	return a.Serve(l)
}

/* -------------------------
   MAIN
   ------------------------- */

func main() {
	// Initialize debug mode
	debugMode = strings.EqualFold(os.Getenv("DEBUG"), "true")
	
	mode := strings.ToLower(env("MODE", "http")) // "http" or "spoe"

	pubHex := os.Getenv("PASETO_V4_PUBLIC_KEY_HEX")
	if strings.TrimSpace(pubHex) == "" {
		log.Fatal("PASETO_V4_PUBLIC_KEY_HEX is required")
	}
	ignoreExp := strings.EqualFold(os.Getenv("IGNORE_EXP"), "true")
	debugLog("ignoreExp: %v", ignoreExp)
	requireAud := os.Getenv("REQUIRE_AUD")
	requireIss := os.Getenv("REQUIRE_ISS")
	userField := env("USER_FIELD", "userId")	
	adminAPIKey := os.Getenv("ADMIN_API_KEY")
	
	log.Printf("Starting SPOE Auth Service in %s mode (debug: %v)", mode, debugMode)

	v, err := newVerifier(pubHex, ignoreExp, requireAud, requireIss, userField)
	if err != nil {
		log.Fatalf("verifier init error: %v", err)
	}

	switch mode {
	case "spoe":
		addr := env("LISTEN_ADDR", ":9000")
		settings := spoeSettings{
			messageName: env("MESSAGE_NAME", "verify"),
			authArg:     env("AUTH_ARG", "auth"),
			apiKeyArg:   env("API_KEY_ARG", "api_key"),
			adminAPIKey: adminAPIKey,
		}
		if err := startSPOE(v, addr, settings); err != nil {
			log.Fatalf("SPOE error: %v", err)
		}
	default:
		addr := env("LISTEN_ADDR", ":8080")
		if err := startHTTP(v, addr, adminAPIKey); err != nil {
			log.Fatalf("HTTP error: %v", err)
		}
	}
}

// parseCookies parses a cookie string and returns a map of cookie name -> value
func parseCookies(cookieStr string) map[string]string {
	cookies := make(map[string]string)
	
	// Split by semicolon and space
	pairs := strings.Split(cookieStr, ";")
	
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		
		// Split by first equals sign
		parts := strings.SplitN(pair, "=", 2)
		if len(parts) == 2 {
			name := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			cookies[name] = value
		}
	}
	
	return cookies
}

func env(k, d string) string {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return d
	}
	return v
}
