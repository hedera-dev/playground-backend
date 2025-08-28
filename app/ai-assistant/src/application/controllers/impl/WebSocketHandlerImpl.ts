import { FastifyInstance } from "fastify";
import { Server, Socket } from "socket.io";
import WebSocketHandler from "../WebSocketHandler";
import { Message, MessageSchema, ClientConnection } from "../../../types.js";
import { OpenAIService } from "../../../domain/services/OpenAIService.js";

export default class WebSocketHandlerImpl implements WebSocketHandler {
	private basePath = "/api/playground/assistant";
	private io!: Server;
	private connections: Map<string, ClientConnection> = new Map();
	private openAIService: OpenAIService = new OpenAIService();

	constructor(private fastify: FastifyInstance) {}

	public async registerRoutes(): Promise<void> {
		try {
			// Crear instancia de Socket.IO directamente sobre el servidor de Fastify
			this.io = new Server(this.fastify.server, {
				path: "/ws/chats",
				cors: {
					origin: "*",
					methods: ["GET", "POST"],
				},
			});

			// Configurar manejadores de eventos
			this.setupEventHandlers();

			// Cerrar correctamente al apagar el servidor
			this.fastify.addHook("onClose", async () => {
				try {
					await this.cleanup();
				} finally {
					this.io?.close();
				}
			});

			console.log("WebSocket routes registered successfully");
		} catch (error) {
			console.error("Error registering WebSocket routes:", error);
			throw error;
		}
	}

	private setupEventHandlers(): void {
		this.io.on("connection", (socket: Socket) => {
			const connection: ClientConnection = {
				id: socket.id,
				socket,
				isAlive: true,
				conversationHistory: [],
			};
			this.connections.set(socket.id, connection);

			console.log("Client connected:", socket.id);
			console.log(
				"Total connected clients:",
				this.io.engine.clientsCount
			);

			// Notificar conexión exitosa
			socket.emit("connected", {
				message: "Connected to Hedera Playground Assistant",
				clientId: socket.id,
				timestamp: new Date().toISOString(),
			});

			const handleMessage = async (raw: unknown) => {
				try {
					const payload: unknown =
						typeof raw === "string" ? JSON.parse(raw) : raw;

					const parsed = MessageSchema.safeParse(payload);
					if (!parsed.success) {
						socket.send(
							JSON.stringify({
								type: "error",
								error: "Invalid message format",
							})
						);
						return;
					}

					const message: Message = parsed.data;

					if (message.type === "ping") {
						socket.send(
							JSON.stringify({
								type: "pong",
							})
						);
						return;
					}

					if (message.type === "chat") {
						const userInput = message.content;

						// Ensure we have a conversationId
						const conversationId =
							message.conversationId || this.generateId("conv");
						const messageId =
							message.messageId || this.generateId("msg");

						await this.openAIService.streamChat(
							userInput,
							connection,
							messageId,
							conversationId
						);
					}
				} catch (err) {
					console.error("Failed to handle message:", err);
					socket.send(
						JSON.stringify({
							type: "error",
							error:
								err instanceof Error
									? err.message
									: "Unknown error",
						})
					);
				}
			};

			// Soportar tanto `message` genérico como evento `chat`
			socket.on("message", handleMessage);
			socket.on("chat", handleMessage);

			// Manejar desconexión
			socket.on("disconnect", (reason: string) => {
				const conn = this.connections.get(socket.id);
				if (conn) {
					conn.isAlive = false;
					this.connections.delete(socket.id);
				}
				console.log(
					"Client disconnected:",
					socket.id,
					"Reason:",
					reason
				);
				console.log(
					"Total connected clients:",
					this.io.engine.clientsCount
				);
			});

			// Manejar errores
			socket.on("error", (error: Error) => {
				console.error("Socket error:", error);
			});
		});
	}

	private generateId(prefix: string): string {
		return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
	}

	public broadcastMessage(message: string): void {
		if (this.io) {
			this.io.emit("broadcast", {
				message,
				timestamp: new Date().toISOString(),
				type: "broadcast",
			});
		}
	}

	public getConnectedClientsCount(): number {
		return this.io ? this.io.engine.clientsCount : 0;
	}

	// Método para limpiar recursos
	public async cleanup(): Promise<void> {
		if (this.io) {
			this.io.removeAllListeners();
		}
	}
}
