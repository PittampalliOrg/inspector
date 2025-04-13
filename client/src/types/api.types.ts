// src/api/api.types.ts
import { z } from 'zod';
import {
  McpConnectionState, ManagedServerState, JsonRpcRequestSchema, JsonRpcNotificationSchema,
  JsonRpcResponseSchema, JsonRpcMessageSchema, ToolSchema, Tool,
  LanguageModelChatMessage // Use type
} from './mcp.types'; // Adjust path if needed

// --- Client -> Server Message Types ---

export const ListServersRequestSchema = z.object({
  type: z.literal('listServers'),
});
export type ListServersRequest = z.infer<typeof ListServersRequestSchema>;

export const ConnectServerRequestSchema = z.object({
  type: z.literal('connect'),
  serverId: z.string(),
});
export type ConnectServerRequest = z.infer<typeof ConnectServerRequestSchema>;

export const DisconnectServerRequestSchema = z.object({
  type: z.literal('disconnect'),
  serverId: z.string(),
});
export type DisconnectServerRequest = z.infer<typeof DisconnectServerRequestSchema>;

export const GetToolsRequestSchema = z.object({
    type: z.literal('getTools'),
    serverId: z.string(),
});
export type GetToolsRequest = z.infer<typeof GetToolsRequestSchema>;

export const McpApiRequestSchema = z.object({
    type: z.literal('request'),
    serverId: z.string(),
    request: JsonRpcRequestSchema.omit({ jsonrpc: true }),
});
export type McpApiRequest = z.infer<typeof McpApiRequestSchema>;


export const McpApiNotificationSchema = z.object({
    type: z.literal('notification'),
    serverId: z.string(),
    notification: JsonRpcNotificationSchema.omit({ jsonrpc: true }),
});
export type McpApiNotification = z.infer<typeof McpApiNotificationSchema>;

// --- NEW: Chat Request ---
export const ChatRequestMessageSchema = z.object({
    type: z.literal('chatRequest'),
    payload: z.object({
        prompt: z.string(),
        history: z.array(z.custom<LanguageModelChatMessage>()).optional(), // Validate using custom if complex
        selectedTools: z.array(z.string()).optional(), // IDs of tools selected by user
        sessionId: z.string().optional(), // Optional session ID for context
        // Add other relevant options if needed
    })
});
export type ChatRequestMessage = z.infer<typeof ChatRequestMessageSchema>;


export const ClientToServerMessageSchema = z.union([
  ListServersRequestSchema,
  ConnectServerRequestSchema,
  DisconnectServerRequestSchema,
  GetToolsRequestSchema,
  McpApiRequestSchema,
  McpApiNotificationSchema,
  ChatRequestMessageSchema, // Add chat request
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;


// --- Server -> Client Message Types ---

export const ServerListResponseSchema = z.object({
  type: z.literal('serverList'),
  servers: z.array(z.custom<ManagedServerState>()),
});
export type ServerListResponse = z.infer<typeof ServerListResponseSchema>;


export const ServerStatusUpdateSchema = z.object({
  type: z.literal('statusUpdate'),
  serverId: z.string(),
  status: z.nativeEnum(McpConnectionState),
  error: z.string().optional(),
  // Include tool info in status updates if fetched
  tools: z.array(ToolSchema).optional(),
  toolFetchStatus: z.enum(['idle', 'fetching', 'fetched', 'error']).optional(),
});
export type ServerStatusUpdate = z.infer<typeof ServerStatusUpdateSchema>;

// --- REMOVED: ToolListResponse (merged into ServerStatusUpdate) ---
// export const ToolListResponseSchema = z.object({ ... });
// export type ToolListResponse = z.infer<typeof ToolListResponseSchema>;

export const McpApiResponseSchema = z.object({
    type: z.literal('response'),
    serverId: z.string(),
    response: JsonRpcResponseSchema,
});
export type McpApiResponse = z.infer<typeof McpApiResponseSchema>;


export const McpServerNotificationSchema = z.object({
    type: z.literal('notification'),
    serverId: z.string(),
    notification: JsonRpcMessageSchema,
});
export type McpServerNotification = z.infer<typeof McpServerNotificationSchema>;


export const ServerStderrMessageSchema = z.object({
    type: z.literal('stderr'),
    serverId: z.string(),
    data: z.string(),
});
export type ServerStderrMessage = z.infer<typeof ServerStderrMessageSchema>;

export const ApiErrorResponseSchema = z.object({
    type: z.literal('error'),
    message: z.string(),
    originalRequestId: z.union([z.string(), z.number()]).optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;


// --- NEW: Chat Response Stream Types ---
export const ChatChunkMessageSchema = z.object({
    type: z.literal('chatChunk'),
    payload: z.object({
        type: z.literal('text'),
        content: z.string()
    })
});
export type ChatChunkMessage = z.infer<typeof ChatChunkMessageSchema>;

export const ToolStartMessageSchema = z.object({
    type: z.literal('toolStart'),
    payload: z.object({
        toolCallId: z.string(),
        toolName: z.string(),
        toolInput: z.unknown(),
    })
});
export type ToolStartMessage = z.infer<typeof ToolStartMessageSchema>;

export const ToolEndMessageSchema = z.object({
    type: z.literal('toolEnd'),
    payload: z.object({
        toolCallId: z.string(),
        output: z.string(), // Stringified tool output
        isError: z.boolean().optional(),
    })
});
export type ToolEndMessage = z.infer<typeof ToolEndMessageSchema>;

export const ChatErrorMessageSchema = z.object({
    type: z.literal('chatError'),
    payload: z.object({
        message: z.string(),
    })
});
export type ChatErrorMessage = z.infer<typeof ChatErrorMessageSchema>;

export const ChatEndMessageSchema = z.object({
    type: z.literal('chatEnd'),
});
export type ChatEndMessage = z.infer<typeof ChatEndMessageSchema>;


export const ServerToClientMessageSchema = z.union([
  ServerListResponseSchema,
  ServerStatusUpdateSchema,
  // ToolListResponseSchema, // Removed
  McpApiResponseSchema,
  McpServerNotificationSchema,
  ServerStderrMessageSchema,
  ApiErrorResponseSchema,
  // Add chat stream messages
  ChatChunkMessageSchema,
  ToolStartMessageSchema,
  ToolEndMessageSchema,
  ChatErrorMessageSchema,
  ChatEndMessageSchema,
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;