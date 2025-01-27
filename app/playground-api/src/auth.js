const paseto = require("paseto");
const config = require("./config");
const logger = require("logplease").create("auth");

const SESSION_COOKIE = "hedera-portal-session";
class Auth {
	
	constructor() {
		this.publicKey = this.keyObject(config.public_key);
	}

	keyObject(keyHex) {
		if (!keyHex) return "";
		const keyBytes = Buffer.from(keyHex, "hex");
		const key = paseto.V4.bytesToKeyObject(keyBytes);

		return key;
	}

	async validateToken(signedToken) { 
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

	authMiddleware() {
		return async (req, res, next) => {
			try {
				if (
					(req.method == "GET" && req.path == "/health") ||
					!this.publicKey
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
							const valid = await this.validateToken(
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
							await this.validateToken(
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
