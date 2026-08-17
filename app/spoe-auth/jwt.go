package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
)

/*
ZITADEL JWT branch (BRA-468).

The portal's BFF forwards the user's ZITADEL access token (an RS256 JWT) to
this gateway, so the agent accepts it next to the legacy PASETO. Validation is
strict — unlike the legacy branch there is no way to ignore expiry here:

  - alg allow-list RS256 (blocks none/HS256 confusion)
  - iss must equal ZITADEL_ISSUER
  - aud must CONTAIN ZITADEL_AUDIENCE (ZITADEL mints aud as an array holding
    the client id and the project id)
  - exp/nbf with a small leeway

The user identity is the JWT_USER_CLAIM claim (default
urn:hedera:portal_user_id), stamped by a ZITADEL Action from user metadata: it
carries the portal's legacy user id, which is what keys user_ai_key and the
per-user rate limits. `sub` is deliberately NOT a fallback — it is the ZITADEL
user id, and injecting it as X-User-ID would silently detach every stored
BYOK key. A token without the claim is refused.

Keys come from the issuer's JWKS, fetched at startup and refreshed two ways:
every JWKS_CACHE_TTL in the background, and synchronously (rate limited) when
a token names an unknown kid. That synchronous fetch is bounded by
JWKS_HTTP_TIMEOUT and runs inside the request path, which HAProxy caps at its
SPOE processing timeout — so the FIRST token signed by a freshly rotated key
can 401 while the fetch completes, and the retry lands. That transient is a
deliberate trade-off; the alternative (an SPOE budget in the seconds) would
let a slow IdP stall the whole gateway.
*/

type JWTVerifierConfig struct {
	Issuer      string
	JWKSURL     string        // defaults to {Issuer}/oauth/v2/keys
	Audience    string        // required: project id the aud array must contain
	UserClaim   string        // defaults to urn:hedera:portal_user_id
	Leeway      time.Duration // exp/nbf slack
	CacheTTL    time.Duration // background JWKS refresh interval
	HTTPTimeout time.Duration // bound on every JWKS fetch, on-miss ones included
	// AllowedClientIDs optionally pins which OAuth clients of the project may
	// pass this gateway (ZITADEL puts the authorized party in `client_id`,
	// never `azp`). Empty means any client of the audience — the first-party
	// apps share one project audience by design (§5.4).
	AllowedClientIDs []string
}

type JWTVerifier struct {
	keys             keyfunc.Keyfunc
	issuer           string
	audience         string
	userClaim        string
	leeway           time.Duration
	allowedClientIDs []string
}

func newJWTVerifier(cfg JWTVerifierConfig) (*JWTVerifier, error) {
	issuer := strings.TrimRight(strings.TrimSpace(cfg.Issuer), "/")
	if issuer == "" {
		return nil, errors.New("empty issuer")
	}
	if strings.TrimSpace(cfg.Audience) == "" {
		return nil, errors.New("ZITADEL_AUDIENCE is required with ZITADEL_ISSUER")
	}
	jwksURL := strings.TrimSpace(cfg.JWKSURL)
	if jwksURL == "" {
		jwksURL = issuer + "/oauth/v2/keys"
	}
	userClaim := strings.TrimSpace(cfg.UserClaim)
	if userClaim == "" {
		userClaim = "urn:hedera:portal_user_id"
	}
	if cfg.CacheTTL <= 0 {
		cfg.CacheTTL = 10 * time.Minute
	}
	if cfg.HTTPTimeout <= 0 {
		cfg.HTTPTimeout = 5 * time.Second
	}

	ctx := context.Background()
	remote, err := jwkset.NewStorageFromHTTP(jwksURL, jwkset.HTTPClientStorageOptions{
		Ctx:             ctx,
		HTTPTimeout:     cfg.HTTPTimeout,
		RefreshInterval: cfg.CacheTTL,
		RefreshErrorHandler: func(_ context.Context, err error) {
			log.Printf("jwks refresh failed url=%s error=%v", jwksURL, err)
		},
	})
	if err != nil {
		return nil, fmt.Errorf("jwks init (%s): %w", jwksURL, err)
	}
	combined, err := jwkset.NewHTTPClient(jwkset.HTTPClientOptions{
		HTTPURLs: map[string]jwkset.Storage{jwksURL: remote},
		// Unknown kid triggers a synchronous, rate-limited refetch: this is
		// what closes a key rotation without waiting a full CacheTTL.
		RefreshUnknownKID: rate.NewLimiter(rate.Every(time.Minute), 2),
	})
	if err != nil {
		return nil, fmt.Errorf("jwks client: %w", err)
	}
	keys, err := keyfunc.New(keyfunc.Options{Ctx: ctx, Storage: combined})
	if err != nil {
		return nil, fmt.Errorf("keyfunc: %w", err)
	}
	log.Printf("JWT branch enabled: issuer=%s audience=%s userClaim=%s jwks=%s cacheTTL=%s httpTimeout=%s",
		issuer, cfg.Audience, userClaim, jwksURL, cfg.CacheTTL, cfg.HTTPTimeout)

	return &JWTVerifier{
		keys:             keys,
		issuer:           issuer,
		audience:         cfg.Audience,
		userClaim:        userClaim,
		leeway:           cfg.Leeway,
		allowedClientIDs: cfg.AllowedClientIDs,
	}, nil
}

// verify returns the portal user id carried by a valid ZITADEL access token.
func (j *JWTVerifier) verify(token string) (string, error) {
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(token, claims, j.keys.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(j.issuer),
		jwt.WithAudience(j.audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(j.leeway),
	)
	if err != nil {
		return "", err
	}

	if len(j.allowedClientIDs) > 0 {
		clientID, _ := claims["client_id"].(string)
		if !slices.Contains(j.allowedClientIDs, clientID) {
			return "", fmt.Errorf("client_id %q not in allow-list", clientID)
		}
	}

	userID, _ := claims[j.userClaim].(string)
	userID = strings.TrimSpace(userID)
	if userID == "" {
		// Fail closed: a valid token from a user (or machine) the portal has
		// not linked yet must not reach the backend under any identity.
		return "", fmt.Errorf("missing %s claim", j.userClaim)
	}
	return userID, nil
}

// isJWT tells the two token formats apart: a compact JWT is three dot-joined
// base64 segments whose header always encodes to "eyJ", while legacy portal
// tokens start with "v4.public.".
func isJWT(token string) bool {
	return strings.HasPrefix(token, "eyJ") && strings.Count(token, ".") == 2
}
