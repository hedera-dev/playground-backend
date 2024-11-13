const paseto = require("paseto");
const config = require("./config");
const logger = require("logplease").create("auth");

class Auth {
	constructor() {
		this.secretKey = this.keyObject(config.secret_key)

	}

	keyObject(keyHex) {
		if (!keyHex)
			return ""
		const keyBytes = Buffer.from(keyHex, "hex");
		const key = paseto.V4.bytesToKeyObject(keyBytes);

		return key;
	}

	async validateUserToken(token) {
		try {
			const claims = await paseto.V4.verify(token, this.secretKey);
			// TODO: CHECK EXPIRATION?
			logger.debug("~ Auth ~ validateUserToken ~ claims:", claims); // TODO: REMOVE
			return true;
		} catch (e) {
			// Invalid token
			return false;
		}
	}

	authMiddleware() {
		return async (req, res, next) => {
			try {
				if ((req.method == "GET" && req.path == '/health') || !this.secretKey) {
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
							const valid = await this.validateUserToken(
								credentials
							);

							if (valid) {
								// TODO: SET SESSION
								return next();
							}
						}
					}
				}
				console.log("holaa")

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
