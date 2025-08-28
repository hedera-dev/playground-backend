import { z } from "zod";

// WebSocket message types
export const MessageSchema = z.object({
  type: z.enum(["chat", "ping"]),
  content: z.string(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// WebSocket response types
export interface ChatResponse {
  type: "chat_start" | "chat_delta" | "chat_complete" | "error" | "pong";
  content?: string;
  messageId?: string;
  conversationId?: string;
  error?: string;
  metadata?: {
    model?: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

// OpenAI streaming events
export interface StreamEvent {
  type: "delta" | "complete" | "error";
  data: any;
}

// Client connection interface
export interface ClientConnection {
  id: string;
  socket: any; // WebSocket instance
  isAlive: boolean;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
