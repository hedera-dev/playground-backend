const paseto = require("paseto");
const config = require("./config");
const logger = require("logplease").create("auth");

const SESSION_COOKIE = "hedera-portal-session";

// jose v6 is ESM-only; from CommonJS it can only be reached via dynamic import().
let josePromise = null;
const loadJose = () => {
	if (!josePromise) josePromise = import("jose");
	return josePromise;
};

class Auth {

	constructor() {
		this.publicKey = config.accept_legacy_paseto
			? this.keyObject(config.public_key)
			: "";
		this.jwt = this.jwtConfig();
		this.jwksPromise = null;

		if (!this.publicKey && !this.jwt) {
			logger.warn(
				"PUBLIC_KEY and ZITADEL_ISSUER are both empty: /api/playground runs without authentication (local dev only, never deploy like this)"
			);
		}
	}

	jwtConfig() {
		if (!config.zitadel_issuer) return null;
		if (!config.zitadel_audience) {
			throw new Error(
				"ZITADEL_AUDIENCE is required when ZITADEL_ISSUER is set; refusing to start with an unverified audience"
			);
		}
		return {
			issuer: config.zitadel_issuer,
			jwksUrl:
				config.zitadel_jwks_url ||
				`${config.zitadel_issuer.replace(/\/$/, "")}/oauth/v2/keys`,
			audience: config.zitadel_audience,
			userClaim: config.jwt_user_claim,
			clockTolerance: config.jwt_clock_skew_seconds,
		};
	}

	async jwks() {
		if (!this.jwksPromise) {
			this.jwksPromise = loadJose().then(jose =>
				jose.createRemoteJWKSet(new URL(this.jwt.jwksUrl))
			);
		}
		return this.jwksPromise;
	}

	isJwt(token) {
		return token.startsWith("eyJ") && token.split(".").length === 3;
	}

	keyObject(keyHex) {
		if (!keyHex) return "";
		const keyBytes = Buffer.from(keyHex, "hex");
		const key = paseto.V4.bytesToKeyObject(keyBytes);

		return key;
	}

	async validateToken(signedToken) {
		if (!this.publicKey) return false;
		try {
			const claims = await paseto.V4.verify(signedToken, this.publicKey, {ignoreExp: true});

			if (!claims.exp) {
				return false
			}

			const expirationDate = new Date(claims.exp);
			const now = new Date();

			// if (now > expirationDate) {
			// 	return false
			// }

			return true;
		} catch (e) {
			// Invalid token
			return false;
		}
	}

	async validateZitadelToken(token) {
		if (!this.jwt) return false;
		try {
			const jose = await loadJose();
			const jwks = await this.jwks();
			const { payload } = await jose.jwtVerify(token, jwks, {
				issuer: this.jwt.issuer,
				audience: this.jwt.audience,
				algorithms: ["RS256"],
				clockTolerance: this.jwt.clockTolerance,
			});

			// Fail closed on tokens without a portal identity (e.g. machine
			// clients): sub is a ZITADEL id, never a portal user id.
			const userId = payload[this.jwt.userClaim];
			if (typeof userId !== "string" || userId.length === 0) {
				return false;
			}

			return true;
		} catch (e) {
			// Invalid token
			return false;
		}
	}

	async validateAnyToken(token) {
		if (this.isJwt(token)) {
			return this.validateZitadelToken(token);
		}
		return this.validateToken(token);
	}

	authMiddleware() {
		return async (req, res, next) => {
			try {
				if (
					(req.method == "GET" && req.path == "/health") ||
					(!this.publicKey && !this.jwt)
				) {
					return next();
				}

				const apiKey = req.headers["x-api-key"];
				if (apiKey && apiKey === config.admin_api_key) {
					return next();
				} else {
					const authorization = req.headers["authorization"];
					if (authorization != null) {
						const [scheme, credentials] = authorization.split(" ");

						if (scheme === "Bearer") {
							const valid = await this.validateAnyToken(
								credentials
							);

							if (valid) {
								return next();
							}
						}
					}

					const sessionCookie = req.cookies[SESSION_COOKIE];

					if (sessionCookie != null) {
						const valid =
							await this.validateAnyToken(
								sessionCookie
							);

						if (valid) {
							return next();
						}
					}
				}

				return res
					.status(401)
					.json({ message: "Invalid or expired token" });
			} catch (error) {
				return res.status(500).json({
					message: "Internal Server Error",
					error: error.message,
				});
			}
		};
	}
}

module.exports = Auth;
