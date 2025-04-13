// src/types/mcp.types.ts
import { z } from 'zod';

// --- Basic JSON-RPC Types ---
export const JsonRpcVersionSchema = z.literal('2.0');
export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

export const JsonRpcRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema.refine((val) => val !== null, {
    message: 'Request ID must not be null',
  }),
  method: z.string(),
  params: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.string(),
  params: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
});
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcSuccessResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  result: z.unknown(),
});
export type JsonRpcSuccessResponse = z.infer<typeof JsonRpcSuccessResponseSchema>;

export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  error: JsonRpcErrorSchema,
});
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>;

export const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
]);
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const JsonRpcMessageSchema = z.union([
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
]);
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;

// --- MCP Tool Types ---
const BaseJsonSchema: z.ZodType<any> = z.lazy(() => z.object({
    type: z.string().optional(),
    description: z.string().optional(),
    properties: z.record(BaseJsonSchema).optional(),
    required: z.array(z.string()).optional(),
    items: BaseJsonSchema.optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}));

export const ToolInputSchema = z.object({
    type: z.literal("object"),
    properties: z.record(BaseJsonSchema).optional().default({}), // Ensure properties exists, default to empty
    required: z.array(z.string()).optional(),
});
export type ToolInputSchema = z.infer<typeof ToolInputSchema>;

export const ToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: ToolInputSchema,
});
export type Tool = z.infer<typeof ToolSchema>;

export const ResultSchema = z.object({
    _meta: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

export const PaginatedResultSchema = ResultSchema.extend({
    nextCursor: z.string().optional(),
});

export const ListToolsResultSchema = PaginatedResultSchema.extend({
    tools: z.array(ToolSchema),
});
export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;

export const CallToolResultContentSchema: z.ZodType<any> = z.lazy(() => z.object({
    type: z.string(),
    text: z.string().optional(),
}));

export const CallToolResultSchema = ResultSchema.extend({
    content: z.array(CallToolResultContentSchema),
    isError: z.boolean().optional(),
});
export type CallToolResult = z.infer<typeof CallToolResultSchema>;


// --- MCP Server Definition Types ---
export const StdioMcpConnectionDefinitionPartSchema = z.object({
  transport: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});
export type StdioMcpConnectionDefinitionPart = z.infer<
  typeof StdioMcpConnectionDefinitionPartSchema
>;

export const SseMcpConnectionDefinitionPartSchema = z.object({
  transport: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});
export type SseMcpConnectionDefinitionPart = z.infer<
  typeof SseMcpConnectionDefinitionPartSchema
>;

export const McpServerDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  transport: z.enum(['stdio', 'sse']),
}).and(z.union([StdioMcpConnectionDefinitionPartSchema, SseMcpConnectionDefinitionPartSchema]));

export type McpServerDefinition = z.infer<typeof McpServerDefinitionSchema>;

// --- Connection State Types ---
export enum McpConnectionState {
  Stopped = 0,
  Starting = 1,
  Running = 2,
  Failed = 3,
  Stopping = 4,
}

export type ManagedServerState = {
  id: string;
  label: string;
  status: McpConnectionState;
  error?: string;
  tools?: Tool[];
  toolFetchStatus?: ToolFetchStatus;
};

export type ToolFetchStatus = 'idle' | 'fetching' | 'fetched' | 'error';


// --- LLM Interaction Types (Inspired by VS Code) ---

export enum LanguageModelChatMessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}

export interface LanguageModelTextPart {
  type: 'text';
  value: string;
}

export interface LanguageModelToolCallPart {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: any;
}

export interface LanguageModelToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type LanguageModelChatMessagePart =
  | { type: "text"; value: string }
  | { type: "tool_call"; toolCallId: string; toolName: string; args: Record<string, any> }
  | { type: "tool_result"; content: string }

export type LanguageModelChatMessage = {
  role: LanguageModelChatMessageRole
  content: string | LanguageModelChatMessagePart[]
}

// Type for schema validation if needed, otherwise use the interface
export const LanguageModelChatMessageSchema = z.custom<LanguageModelChatMessage>();

export type LanguageModelChatTool = {
  name: string
  description?: string
  inputSchema: any 
}

export type LanguageModelChatResponse = {
  stream: AsyncIterable<LanguageModelChatMessagePart>
}

// --- Tool Service Types ---

export type ToolDataSourceType = 'mcp' | 'local' | 'internal';

export interface ToolDataSource {
    type: ToolDataSourceType;
    serverId?: string;
    toolName?: string;
}

export interface IToolData {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  inputSchema: ToolInputSchema;
  source: ToolDataSource;
}

export interface IToolInvocationContext {
    sessionId?: string;
}

export interface IToolResult {
    content: string;
    isError?: boolean;
}

export interface IToolImpl {
  invoke(parameters: any, context?: IToolInvocationContext): Promise<IToolResult>;
}

// --- Chat Service Types (Internal Stream Chunks - NO payload wrapper) ---
export interface ChatStreamChunkText {
    type: 'chatChunk';
    content: string;
}
export interface ChatStreamChunkToolStart {
    type: 'toolStart';
    toolCallId: string;
    toolName: string;
    toolInput: any;
}
export interface ChatStreamChunkToolEnd {
    type: 'toolEnd';
    toolCallId: string;
    output: string; // Stringified output
    isError?: boolean;
}
export interface ChatStreamChunkError {
    type: 'chatError';
    message: string;
}
export interface ChatStreamChunkEnd {
    type: 'chatEnd';
}

// Union type for the internal stream between ChatService and WebSocketHandler
export type ChatStreamChunk = ChatStreamChunkText | ChatStreamChunkToolStart | ChatStreamChunkToolEnd | ChatStreamChunkError | ChatStreamChunkEnd;


// --- Utility Error Class ---
export class McpError extends Error {
    code: number;
    data?: unknown;
    constructor(message: string, code: number, data?: unknown) {
        super(message);
        this.name = 'McpError';
        this.code = code;
        this.data = data;
    }
}