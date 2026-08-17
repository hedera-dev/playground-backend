package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
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

Keys come from the issuer's JWKS with a background refresh plus a rate-limited
refetch on unknown kid (ZITADEL rotates signing keys ~6h without grace). The
JWKS is fetched at startup so no request ever pays the HTTP round trip — the
SPOE runs inside HAProxy's `timeout processing`.
*/

type JWTVerifier struct {
	keys      keyfunc.Keyfunc
	issuer    string
	audience  string
	userClaim string
	leeway    time.Duration
}

func newJWTVerifier(issuer, jwksURL, audience, userClaim string, leeway time.Duration) (*JWTVerifier, error) {
	issuer = strings.TrimRight(strings.TrimSpace(issuer), "/")
	if issuer == "" {
		return nil, errors.New("empty issuer")
	}
	if strings.TrimSpace(audience) == "" {
		return nil, errors.New("ZITADEL_AUDIENCE is required with ZITADEL_ISSUER")
	}
	if strings.TrimSpace(jwksURL) == "" {
		jwksURL = issuer + "/oauth/v2/keys"
	}
	if strings.TrimSpace(userClaim) == "" {
		userClaim = "urn:hedera:portal_user_id"
	}

	// keyfunc.NewDefault fetches eagerly and keeps refreshing in the
	// background, refetching on unknown kid with a rate limit.
	keys, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("jwks init (%s): %w", jwksURL, err)
	}
	log.Printf("JWT branch enabled: issuer=%s audience=%s userClaim=%s jwks=%s", issuer, audience, userClaim, jwksURL)

	return &JWTVerifier{
		keys:      keys,
		issuer:    issuer,
		audience:  audience,
		userClaim: userClaim,
		leeway:    leeway,
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
		debugLog("jwt verification failed: %v", err)
		return "", err
	}

	userID, _ := claims[j.userClaim].(string)
	userID = strings.TrimSpace(userID)
	if userID == "" {
		// Fail closed: a valid token from a user (or machine) the portal has
		// not linked yet must not reach the backend under any identity.
		debugLog("jwt valid but %s claim missing", j.userClaim)
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
