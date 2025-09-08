import { z } from "zod";

// HTTP Chat request types
export const ChatRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  conversationId: z.string().optional().nullable(),
  messageId: z.string().optional().nullable(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Conversation history type
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

// Chat session interface
export interface ChatSession {
  id: string;
  conversationHistory: ConversationMessage[];
  createdAt: Date;
  lastActivity: Date;
}

// Streaming response events (for SSE)
export interface StreamingEvent {
  type: "start" | "delta" | "complete" | "error";
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
