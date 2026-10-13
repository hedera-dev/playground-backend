package main

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	paseto "aidanwoods.dev/go-paseto/v2"
	"github.com/golang-jwt/jwt/v5"
)

const (
	testIssuer   = "http://zitadel.test"
	testProject  = "385679625314893827"
	testClientID = "385679625398845443"
	portalClaim  = "urn:hedera:portal_user_id"
	portalUserID = "3f8d5c98-957e-11f1-afc6-9fc11ee3e300"
)

type testKey struct {
	kid string
	key *rsa.PrivateKey
}

func newTestKey(t *testing.T, kid string) testKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("rsa: %v", err)
	}
	return testKey{kid: kid, key: key}
}

func jwksFor(keys ...testKey) []byte {
	type jwk struct {
		Kty string `json:"kty"`
		Kid string `json:"kid"`
		Use string `json:"use"`
		Alg string `json:"alg"`
		N   string `json:"n"`
		E   string `json:"e"`
	}
	set := struct {
		Keys []jwk `json:"keys"`
	}{}
	for _, k := range keys {
		pub := k.key.Public().(*rsa.PublicKey)
		set.Keys = append(set.Keys, jwk{
			Kty: "RSA",
			Kid: k.kid,
			Use: "sig",
			Alg: "RS256",
			N:   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
		})
	}
	out, _ := json.Marshal(set)
	return out
}

func serveJWKS(t *testing.T, keys ...testKey) *httptest.Server {
	t.Helper()
	body := jwksFor(keys...)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	return server
}

type claimOverrides map[string]any

func mintJWT(t *testing.T, k testKey, method jwt.SigningMethod, overrides claimOverrides) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss":       testIssuer,
		"aud":       []string{testClientID, testProject},
		"sub":       "385801011576438787",
		"client_id": testClientID,
		"exp":       time.Now().Add(time.Hour).Unix(),
		"iat":       time.Now().Unix(),
		portalClaim: portalUserID,
	}
	for key, value := range overrides {
		if value == nil {
			delete(claims, key)
			continue
		}
		claims[key] = value
	}
	token := jwt.NewWithClaims(method, claims)
	token.Header["kid"] = k.kid
	var signKey any = k.key
	if method == jwt.SigningMethodHS256 {
		signKey = []byte("not-an-rsa-key")
	}
	signed, err := token.SignedString(signKey)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed
}

func newTestJWTVerifier(t *testing.T, server *httptest.Server) *JWTVerifier {
	t.Helper()
	v, err := newJWTVerifier(JWTVerifierConfig{
		Issuer:    testIssuer,
		JWKSURL:   server.URL,
		Audience:  testProject,
		UserClaim: portalClaim,
		Leeway:    30 * time.Second,
	})
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	return v
}

func TestJWTValidTokenReturnsPortalUserID(t *testing.T) {
	k := newTestKey(t, "kid-1")
	v := newTestJWTVerifier(t, serveJWKS(t, k))

	got, err := v.verify(mintJWT(t, k, jwt.SigningMethodRS256, nil))
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got != portalUserID {
		t.Fatalf("user id = %q, want %q", got, portalUserID)
	}
}

func TestJWTPicksTheRightKeyByKid(t *testing.T) {
	k1 := newTestKey(t, "kid-1")
	k2 := newTestKey(t, "kid-2")
	v := newTestJWTVerifier(t, serveJWKS(t, k1, k2))

	for _, k := range []testKey{k1, k2} {
		if _, err := v.verify(mintJWT(t, k, jwt.SigningMethodRS256, nil)); err != nil {
			t.Fatalf("verify with %s: %v", k.kid, err)
		}
	}
}

func TestJWTRejections(t *testing.T) {
	k := newTestKey(t, "kid-1")
	stranger := newTestKey(t, "kid-1") // same kid, different key: bad signature
	v := newTestJWTVerifier(t, serveJWKS(t, k))

	cases := map[string]string{
		"expired":          mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{"exp": time.Now().Add(-2 * time.Hour).Unix()}),
		"missing exp":      mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{"exp": nil}),
		"wrong issuer":     mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{"iss": "http://evil.test"}),
		"audience misses":  mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{"aud": []string{testClientID}}),
		"hs256 confusion":  mintJWT(t, k, jwt.SigningMethodHS256, nil),
		"bad signature":    mintJWT(t, stranger, jwt.SigningMethodRS256, nil),
		"no portal claim":  mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{portalClaim: nil}),
		"empty user claim": mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{portalClaim: "  "}),
	}
	for name, token := range cases {
		if _, err := v.verify(token); err == nil {
			t.Errorf("%s: expected rejection, token was accepted", name)
		}
	}
}

// The IdP rotates keys by signing with a new kid while briefly keeping the
// old one published. The unknown-kid path refetches synchronously, so this is
// deterministic — no sleeps, no polling.
func TestJWKSRotationServesNewKidDeterministically(t *testing.T) {
	k1 := newTestKey(t, "kid-1")
	k2 := newTestKey(t, "kid-2")

	var body atomic.Value
	body.Store(jwksFor(k1))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body.Load().([]byte))
	}))
	t.Cleanup(server.Close)

	v := newTestJWTVerifier(t, server)

	if _, err := v.verify(mintJWT(t, k1, jwt.SigningMethodRS256, nil)); err != nil {
		t.Fatalf("kid-1 before rotation: %v", err)
	}

	// Rotation: the JWKS now carries both keys and tokens arrive under kid-2.
	body.Store(jwksFor(k1, k2))
	if _, err := v.verify(mintJWT(t, k2, jwt.SigningMethodRS256, nil)); err != nil {
		t.Fatalf("kid-2 right after rotation (unknown-kid refetch): %v", err)
	}

	// The old key drops out of the JWKS; the cached copy keeps validating
	// tokens that were signed with it until the next background refresh.
	body.Store(jwksFor(k2))
	if _, err := v.verify(mintJWT(t, k1, jwt.SigningMethodRS256, nil)); err != nil {
		t.Fatalf("kid-1 from cache after retirement: %v", err)
	}
}

func TestJWTClientIDAllowList(t *testing.T) {
	k := newTestKey(t, "kid-1")
	server := serveJWKS(t, k)

	pinned, err := newJWTVerifier(JWTVerifierConfig{
		Issuer:           testIssuer,
		JWKSURL:          server.URL,
		Audience:         testProject,
		UserClaim:        portalClaim,
		AllowedClientIDs: []string{testClientID},
	})
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}

	if _, err := pinned.verify(mintJWT(t, k, jwt.SigningMethodRS256, nil)); err != nil {
		t.Fatalf("allow-listed client refused: %v", err)
	}
	if _, err := pinned.verify(mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{"client_id": "someone-else"})); err == nil {
		t.Fatal("foreign client accepted despite the allow-list")
	}
}

func TestJWTNeverFallsBackToSub(t *testing.T) {
	k := newTestKey(t, "kid-1")
	v := newTestJWTVerifier(t, serveJWKS(t, k))

	got, err := v.verify(mintJWT(t, k, jwt.SigningMethodRS256, claimOverrides{portalClaim: nil}))
	if err == nil {
		t.Fatalf("token without %s was accepted as %q", portalClaim, got)
	}
}

func mintPaseto(t *testing.T, secret paseto.V4AsymmetricSecretKey, userID string) string {
	t.Helper()
	token := paseto.NewToken()
	token.SetString("userId", userID)
	token.SetIssuedAt(time.Now())
	token.SetNotBefore(time.Now())
	token.SetExpiration(time.Now().Add(time.Hour))
	return token.V4Sign(secret, nil)
}

func TestDispatchRoutesEachFormatToItsBranch(t *testing.T) {
	k := newTestKey(t, "kid-1")
	secret := paseto.NewV4AsymmetricSecretKey()

	v, err := newVerifier(secret.Public().ExportHex(), false, "", "", "userId")
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	v.jwt = newTestJWTVerifier(t, serveJWKS(t, k))

	if got, err := v.verifyToken(mintPaseto(t, secret, "legacy-user")); err != nil || got != "legacy-user" {
		t.Fatalf("paseto branch: got %q, err %v", got, err)
	}
	if got, err := v.verifyToken("Bearer " + mintJWT(t, k, jwt.SigningMethodRS256, nil)); err != nil || got != portalUserID {
		t.Fatalf("jwt branch: got %q, err %v", got, err)
	}
}

func TestDispatchRefusesDisabledBranches(t *testing.T) {
	k := newTestKey(t, "kid-1")
	secret := paseto.NewV4AsymmetricSecretKey()

	// Legacy branch off (no PASETO key): a paseto token must be refused even
	// though the jwt branch is up.
	jwtOnly, err := newVerifier("", false, "", "", "userId")
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	jwtOnly.jwt = newTestJWTVerifier(t, serveJWKS(t, k))
	if _, err := jwtOnly.verifyToken(mintPaseto(t, secret, "legacy-user")); err == nil {
		t.Fatal("paseto accepted with the legacy branch disabled")
	}

	// JWT branch off: a ZITADEL token must be refused, not parsed as paseto.
	legacyOnly, err := newVerifier(secret.Public().ExportHex(), false, "", "", "userId")
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	if _, err := legacyOnly.verifyToken(mintJWT(t, k, jwt.SigningMethodRS256, nil)); err == nil {
		t.Fatal("jwt accepted with the jwt branch disabled")
	}
}
