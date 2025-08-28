import { FastifyInstance } from "fastify";

export default interface WebSocketHandler {
  registerRoutes(): Promise<void>;
  broadcastMessage(message: string): void;
  getConnectedClientsCount(): number;
}
