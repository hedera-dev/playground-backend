import { z } from 'zod';
import { tool } from 'ai';
import { createLogger } from '../../../utils/logger.js';
import { ExternalServiceError, ErrorReason, ValidationError } from '../../../utils/errors.js';

const logger = createLogger(undefined, 'HederaTools');

export const SearchHederaSchema = z.object({
  query: z.string().describe('A query to search the content with.')
});

export type SearchHedera = z.infer<typeof SearchHederaSchema>;

const HEDERA_MCP_URL = 'https://docs.hedera.com/mcp';

/**
 * Parses Server-Sent Events (SSE) stream
 */
async function parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return buffer;
}

/**
 * Extracts JSON data from SSE stream
 */
function extractJSONFromSSE(sseData: string): any {
  const lines = sseData.split('\n');
  let jsonData = '';

  for (const line of lines) {
    // Skip SSE metadata lines (event:, id:, etc.)
    if (line.startsWith('event:') || line.startsWith('id:') || line.startsWith(':')) {
      continue;
    }
    // Data lines start with "data: "
    if (line.startsWith('data: ')) {
      jsonData += line.substring(6); // Remove "data: " prefix
    } else if (line.trim() && !line.startsWith('event') && !line.startsWith('id')) {
      // Sometimes data continues without "data: " prefix
      jsonData += line;
    }
  }

  if (!jsonData.trim()) {
    // If no data found, try parsing the entire stream as JSON
    try {
      return JSON.parse(sseData);
    } catch {
      throw new ExternalServiceError('No valid JSON data found in SSE stream', ErrorReason.HEDERA_MCP_ERROR, 502, {
        service: 'Hedera MCP',
        operation: 'parseSSE'
      });
    }
  }

  try {
    return JSON.parse(jsonData);
  } catch (error) {
    // If parsing fails, try to extract JSON from the data string
    const jsonMatch = jsonData.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new ExternalServiceError(`Failed to parse JSON from SSE: ${error instanceof Error ? error.message : 'Unknown error'}`, ErrorReason.HEDERA_MCP_ERROR, 502, {
      service: 'Hedera MCP',
      operation: 'parseSSE'
    });
  }
}

/**
 * Makes an HTTP POST request to the Hedera MCP server to search documentation
 * Uses JSON-RPC 2.0 format as per MCP protocol specification
 * Handles Server-Sent Events (SSE) response format
 */
async function searchHederaMCP(query: string): Promise<any> {
  try {
    const response = await fetch(HEDERA_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'SearchHedera',
          arguments: {
            query
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('Hedera MCP request failed', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        query
      });
      throw new ExternalServiceError(`Hedera MCP request failed: ${response.status} ${response.statusText}`, ErrorReason.HEDERA_MCP_ERROR, response.status >= 500 ? 503 : 502, { 
        service: 'Hedera MCP',
        operation: 'search',
        query, 
        errorText 
      });
    }

    // Check if response is SSE stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // Handle SSE stream
      if (!response.body) {
        throw new ExternalServiceError('Response body is null', ErrorReason.HEDERA_MCP_ERROR, 502, {
          service: 'Hedera MCP',
          operation: 'search'
        });
      }

      const reader = response.body.getReader();
      const sseData = await parseSSEStream(reader);
      const data = extractJSONFromSSE(sseData);

      // Handle error responses
      if (data.error) {
        logger.error('Hedera MCP error', { error: data.error, query });
        throw new ExternalServiceError(`Hedera MCP error: ${JSON.stringify(data.error)}`, ErrorReason.HEDERA_MCP_ERROR, 502, { 
          service: 'Hedera MCP',
          operation: 'search',
          query, 
          mcpError: data.error 
        });
      }

      return data;
    } else {
      // Handle regular JSON response
      const data = await response.json();

      // Handle error responses
      if (data.error) {
        logger.error('Hedera MCP error', { error: data.error, query });
        throw new ExternalServiceError(`Hedera MCP error: ${JSON.stringify(data.error)}`, ErrorReason.HEDERA_MCP_ERROR, 502, { 
          service: 'Hedera MCP',
          operation: 'search',
          query, 
          mcpError: data.error 
        });
      }

      return data;
    }
  } catch (error) {
    logger.error('Error calling Hedera MCP', { error, query });
    if (error instanceof ExternalServiceError) {
    throw error;
    }
    throw new ExternalServiceError('Error calling Hedera MCP', ErrorReason.HEDERA_MCP_ERROR, 502, { 
      service: 'Hedera MCP',
      operation: 'search',
      query, 
      originalError: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Tool for searching Hedera documentation via MCP server
 * Use this tool when you need to answer questions about Hedera, find specific documentation,
 * understand how features work, or locate implementation details.
 */
export const searchHederaTool = () =>
  tool({
    description:
      'Search across the Hedera knowledge base to find relevant information, code examples, API references, and guides. Use this tool when you need to answer questions about Hedera, find specific documentation, understand how features work, or locate implementation details. IMPORTANT: After receiving the search results, use the documentationContent to provide a helpful, natural answer to the user\'s question. Do NOT simply repeat the raw search results - synthesize the information into a clear, conversational response that directly addresses what the user asked.',
    inputSchema: SearchHederaSchema,
    execute: async (args: SearchHedera) => {
      logger.info('Executing searchHedera tool', { query: args?.query });
      if (!args || !args.query) {
        logger.warn('SearchHedera called without query');
        throw new ValidationError('Query parameter is required', ErrorReason.INVALID_INPUT);
      }

      try {
        const results = await searchHederaMCP(args.query);
        logger.debug('Hedera MCP results received', {
          hasResult: !!results?.result,
          hasContent: !!results?.result?.content
        });
        // Extract and format content from MCP response for the model to use
        let formattedContent = '';

        if (results?.result?.content) {
          const contentItems = Array.isArray(results.result.content)
            ? results.result.content
            : [results.result.content];

          formattedContent = contentItems
            .filter((item: any) => item?.type === 'text' && item?.text)
            .map((item: any) => {
              const text = item.text || '';
              // Extract title and link if present
              const titleMatch = text.match(/Title:\s*(.+?)(?:\n|Link:)/);
              const linkMatch = text.match(/Link:\s*(.+?)(?:\n|Content:)/);
              const contentMatch = text.match(/Content:\s*(.+)/s);

              const title = titleMatch ? titleMatch[1].trim() : '';
              const link = linkMatch ? linkMatch[1].trim() : '';
              const content = contentMatch ? contentMatch[1].trim() : text;

              let formatted = '';
              if (title) formatted += `**${title}**\n`;
              if (link) formatted += `Documentation: ${link}\n\n`;
              if (content) formatted += `${content}\n`;

              return formatted;
            })
            .join('\n---\n\n');
        } else if (results?.content) {
          // Handle alternative response format
          const contentItems = Array.isArray(results.content)
            ? results.content
            : [results.content];

          formattedContent = contentItems
            .filter((item: any) => item?.type === 'text' && item?.text)
            .map((item: any) => item.text)
            .join('\n\n---\n\n');
        }

        logger.info('Tool execution completed', {
          query: args.query,
          contentLength: formattedContent.length,
          foundResults: formattedContent.length > 0
        });

        // Return formatted content that the model can use to answer the user's question
        // The model will receive this in the tool result and should generate a text response
        const toolResult = {
          searchQuery: args.query,
          documentationContent: formattedContent || 'No relevant documentation found.',
          foundResults: formattedContent.length > 0
        };

        logger.debug('Returning tool result', {
          resultKeys: Object.keys(toolResult),
          contentPreview: formattedContent.substring(0, 200)
        });

        return toolResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error executing SearchHedera tool', {
          error: errorMessage,
          errorDetails: error,
          query: args.query
        });
        // Re-throw typed errors
        if (error instanceof ExternalServiceError || error instanceof ValidationError) {
          throw error;
        }
        // Wrap unknown errors
        throw new ExternalServiceError('Error executing SearchHedera tool', ErrorReason.HEDERA_MCP_ERROR, 502, { 
          service: 'Hedera MCP',
          operation: 'search',
          query: args.query, 
          originalError: errorMessage 
        });
      }
    }
  });

