import Fastify, { FastifyBaseLogger, FastifyInstance } from "fastify";
import { config } from "dotenv";
import WebSocketHandlerImpl from "./application/controllers/impl/WebSocketHandlerImpl.js";
import HealthControllerImpl from "./application/controllers/impl/HealthControllerImpl.js";
import pino from "pino";
import PinoPretty from "pino-pretty";

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const logger = pino(
	{
		level: process.env.NODE_ENV === "development" ? "info" : "warn",
	},
	PinoPretty({ colorize: true, translateTime: "yyyy-mm-dd HH:MM:ss" })
);

const fastify: FastifyInstance = Fastify({
	loggerInstance: logger as FastifyBaseLogger,
});

fastify.setErrorHandler((error, request, reply) => {
	fastify.log.error(error);

	const statusCode = error.statusCode || 500;
	const message = error.message || "Internal Server Error";

	reply.status(statusCode).send({
		error: {
			message,
			statusCode,
			timestamp: new Date().toISOString(),
		},
	});
});

fastify.setNotFoundHandler((request, reply) => {
	reply.status(404).send({
		error: {
			message: "Route not found",
			statusCode: 404,
			path: request.url,
			method: request.method,
			timestamp: new Date().toISOString(),
		},
	});
});

async function start() {
	try {
		const healthController = new HealthControllerImpl(fastify);
		const wsHandler = new WebSocketHandlerImpl(fastify);

		await healthController.registerRoutes();
		await wsHandler.registerRoutes();

		fastify.get("/api/stats", async (request, reply) => {
			return {
				connectedClients: wsHandler.getConnectedClientsCount(),
				timestamp: new Date().toISOString(),
				status: "running",
			};
		});

		await fastify.listen({ port: PORT, host: HOST });

		console.log(
			`🚀 Hedera Playground Backend running on http://${HOST}:${PORT}`
		);
		console.log(
			`📡 WebSocket endpoint (Socket.IO path): ws://${HOST}:${PORT}/ws/chats`
		);
		console.log(
			`🔍 Health check: http://${HOST}:${PORT}/api/playground/assistant/health`
		);
		console.log(`📊 Stats: http://${HOST}:${PORT}/api/stats`);
	} catch (error) {
		fastify.log.error(error);
		process.exit(1);
	}
}

// Start the server
start().catch((error) => {
	console.error("Failed to start server:", error);
	process.exit(1);
});
