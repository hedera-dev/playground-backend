import OpenAI from "openai";
import fs from "node:fs";
import { ClientConnection, ChatResponse } from "../../types.js";

const MODEL_OPENAI = process.env.MODEL_OPENAI || "gpt-4o";
const VECTOR_STORE_ID =
	process.env.VECTOR_STORE_ID || "vs_688ceeab314c8191a557a849b28cf815";

export class OpenAIService {
	private client: OpenAI;
	private readonly systemPrompt: string;

	private readonly defaultInstructions = `You are a Web3 expert specialized in the Hedera ecosystem. All Web3-related questions must be answered through the lens of Hedera, emphasizing its tools, features, and best practices.  
    When the user provides code, analyze it carefully for errors. Respond concisely by pointing out only the correction and the exact line to fix. Never regenerate or rewrite the full code. For examples or explanations, always rely on the Hedera SDK and keep responses minimal, targeted, and easy to apply.  
    You have access to a vector database and should use it to enhance context whenever it strengthens your answer. Communicate in a clear, direct, and concise style—avoid filler, repetition, or unnecessary details. The goal is to deliver precise, actionable guidance with maximum efficiency.
`;

	constructor() {
		this.client = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});
		this.systemPrompt = this.getInstructions();
	}

	private getInstructions(): string {
		const instructionsPath = process.env.INSTRUCTIONS_PATH;
		if (instructionsPath && instructionsPath.trim().length > 0) {
			try {
				if (fs.existsSync(instructionsPath)) {
					return fs.readFileSync(instructionsPath, "utf-8");
				}
			} catch (error) {
				console.error(
					"Failed to read instructions from path:",
					instructionsPath,
					error
				);
			}
		}

		return this.defaultInstructions;
	}

	private sendResponse(
		connection: ClientConnection,
		response: ChatResponse
	): void {
		const isNativeWebSocketReady =
			typeof connection.socket?.readyState === "number"
				? connection.socket.readyState === 1
				: true; // Assume true for socket.io
		if (connection.isAlive && isNativeWebSocketReady) {
			try {
				connection.socket.send(JSON.stringify(response));
			} catch (error) {
				console.error("Error sending response to client:", error);
				connection.isAlive = false;
			}
		}
	}

	// Alternative using OpenAI Responses API (beta)
	async streamChat(
		userInput: string,
		connection: ClientConnection,
		messageId: string,
		conversationId: string
	): Promise<void> {
		try {
			// Add user message to conversation history
			connection.conversationHistory.push({
				role: "user",
				content: userInput,
			});

			// Send chat start event
			this.sendResponse(connection, {
				type: "chat_start",
				messageId,
				conversationId,
			});

			// Create complete context for response
			const fullContext = connection.conversationHistory
				.map(
					(msg) =>
						`${msg.role === "user" ? "Developer" : "Assistant"}: ${
							msg.content
						}`
				)
				.join("\n\n");

			// Create streaming response using Responses API
			const responseStream = await this.client.responses.create({
				model: MODEL_OPENAI,
				input: fullContext,
				instructions: this.systemPrompt,
				stream: true,
				/*tools: [
          {
            type: "file_search",
            vector_store_ids: [VECTOR_STORE_ID],
          },
        ],*/
			});

			let fullResponse = "";

			// Process streaming events
			for await (const event of responseStream) {
				if (!connection.isAlive) {
					break;
				}

				if (event.type === "response.output_text.delta") {
					const delta = event.delta;
					if (delta) {
						fullResponse += delta;

						this.sendResponse(connection, {
							type: "chat_delta",
							content: delta,
							messageId,
							conversationId,
						});
					}
				} else if (event.type === "response.completed") {
					break;
				} else if (event.type === "error") {
					const message =
						(event as any)?.error?.message || "Unknown error";
					throw new Error(`Responses API error: ${message}`);
				}
			}

			// Add assistant response to conversation history
			if (fullResponse) {
				connection.conversationHistory.push({
					role: "assistant",
					content: fullResponse,
				});
			}

			// Send completion event
			this.sendResponse(connection, {
				type: "chat_complete",
				messageId,
				conversationId,
				metadata: {
					model: MODEL_OPENAI,
					finishReason: "stop",
				},
			});
		} catch (error) {
			console.error("Error in OpenAI Responses API streaming:", error);

			this.sendResponse(connection, {
				type: "error",
				error:
					error instanceof Error
						? error.message
						: "Unknown error occurred",
				messageId,
				conversationId,
			});
		}
	}
}
