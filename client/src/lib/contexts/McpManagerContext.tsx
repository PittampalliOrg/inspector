'use client';
import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
  type ReactNode, type FC, useMemo
} from 'react';
import { toast } from 'sonner';
import {
  ManagedServerState, JsonRpcRequest, JsonRpcNotification,
  JsonRpcResponse, McpError, 
  ChatStreamChunk} from "@/types/mcp.types"; // Adjust path if needed
import {
  ClientToServerMessage, ServerToClientMessageSchema,
  ServerStatusUpdate,
  ChatRequestMessage} from '@/types/api.types'; // Adjust path if needed
import { generateUUID } from '@/lib/utils';

type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

interface PendingRequest {
  resolve: (res: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// Interface definition matching the implementation
interface McpManagerContextType {
  wsStatus: WebSocketStatus;
  serverStates: Record<string, ManagedServerState>;
  connectToServer: (serverId: string) => void;
  disconnectFromServer: (serverId: string) => void;
  sendMcpRequest: (
    serverId: string,
    request: Omit<JsonRpcRequest, 'jsonrpc' | 'id'> & { id?: string | number },
    timeoutMs?: number,
  ) => Promise<JsonRpcResponse>;
  sendMcpNotification: (
    serverId: string,
    notification: Omit<JsonRpcNotification, 'jsonrpc'>,
  ) => void;
  // Correct signature for sendChatPrompt
  sendChatPrompt: (
      payload: ChatRequestMessage['payload'],
      onChunk: (chunk: ChatStreamChunk) => void,
      onError: (error: Error) => void,
      onEnd: () => void
  ) => void;
  selectedTools: string[];
  setSelectedTools: React.Dispatch<React.SetStateAction<string[]>>; // Needs to be exposed
}

const McpManagerContext = createContext<McpManagerContextType | undefined>(undefined);
const DEFAULT_REQUEST_TIMEOUT = 30000;

const getWebSocketUrl = (): string => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.NEXT_PUBLIC_MCP_MANAGER_WS_HOST || window.location.hostname;
    const wsPort = process.env.NEXT_PUBLIC_MCP_MANAGER_WS_PORT || '6278';
    return `${wsProto}//${wsHost}:${wsPort}`;
};

export const McpManagerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>('connecting');
  const [serverStates, setServerStates] = useState<Record<string, ManagedServerState>>({});
  const [selectedTools, setSelectedTools] = useState<string[]>([]); // State for selected tools

  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const pendingRequests = useRef<Map<string | number, PendingRequest>>(new Map());
  const connectionAttemptActive = useRef(false);
  const isUnmountingRef = useRef(false);
  // Store callbacks for the *active* chat stream
  const chatStreamHandlers = useRef<{
      onChunk: (chunk: ChatStreamChunk) => void;
      onError: (error: Error) => void;
      onEnd: () => void;
  } | null>(null);

  const sendMessage = useCallback((message: ClientToServerMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.error('[McpManagerContext] Cannot send, WS not open.');
      toast.error("Connection error. Please try refreshing.");
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (connectionAttemptActive.current || (ws.current && ws.current.readyState !== WebSocket.CLOSED)) {
        return () => {};
    }
    connectionAttemptActive.current = true;
    setWsStatus('connecting');
    console.info('[McpManagerContext] Attempting WS connection...');
    if (reconnectTimeout.current) { clearTimeout(reconnectTimeout.current); reconnectTimeout.current = null; }
    if (ws.current) { ws.current.close(1000, "New connection attempt"); ws.current = null; }

    const socketUrl = getWebSocketUrl();
    let socketInstance: WebSocket | null = null;
    try { socketInstance = new WebSocket(socketUrl, "mcp"); }
    catch (error) {
       console.error("[McpManagerContext] WS constructor failed:", error); setWsStatus('error'); connectionAttemptActive.current = false;
       if (!isUnmountingRef.current && reconnectAttempts.current < 5) {
           const delay = Math.pow(2, reconnectAttempts.current++) * 1000; console.info(`[McpManagerContext] Scheduling reconnect after constructor error in ${delay}ms...`);
           reconnectTimeout.current = setTimeout(connectWebSocket, delay);
       } else { toast.error("Failed to establish WebSocket connection."); } return () => {};
    }

    let isOpen = false;

    const handleOpen = () => {
       if (socketInstance && (ws.current === null || ws.current === socketInstance)) {
          isOpen = true;
          console.info('[McpManagerContext] WebSocket connected.'); connectionAttemptActive.current = false;
          ws.current = socketInstance;
          setWsStatus('open'); reconnectAttempts.current = 0;
          sendMessage({ type: 'listServers' });
       } else { socketInstance?.close(1000, "Stale connection opened"); }
    };

    const handleClose = (event: CloseEvent) => {
       console.warn(`[McpManagerContext] WebSocket closed. Code: ${event.code}`); connectionAttemptActive.current = false;
       if (ws.current === socketInstance || ws.current === null) {
          if (ws.current === socketInstance) ws.current = null;
          setWsStatus('closed'); setServerStates({});
          pendingRequests.current.forEach((req) => { clearTimeout(req.timer); req.reject(new Error('WebSocket closed')); }); pendingRequests.current.clear();
          chatStreamHandlers.current?.onError(new Error('WebSocket closed'));
          chatStreamHandlers.current = null;

          if (!event.wasClean && !isUnmountingRef.current && reconnectAttempts.current < 5) {
             const delay = Math.pow(2, reconnectAttempts.current++) * 1000; console.info(`[McpManagerContext] Scheduling reconnect ${reconnectAttempts.current} in ${delay}ms...`);
             reconnectTimeout.current = setTimeout(connectWebSocket, delay);
          } else if (reconnectAttempts.current >= 5) { console.error('[McpManagerContext] Max reconnects reached.'); toast.error("WebSocket Reconnect failed."); }
       }
       removeSocketListeners();
    };

    const handleError = (error: Event) => { console.error('[McpManagerContext] WebSocket error:', error); connectionAttemptActive.current = false; if (ws.current === socketInstance) { setWsStatus('error'); } socketInstance?.close(); };

    const handleMessage = (event: MessageEvent) => {
        if (ws.current !== socketInstance || isUnmountingRef.current) return;
         try {
             const messageData = JSON.parse(event.data.toString());
             const validation = ServerToClientMessageSchema.safeParse(messageData);
             if (!validation.success) { console.warn('[McpManagerContext] Invalid message:', validation.error.errors); return; }
             const message = validation.data;

             switch (message.type) {
                 case 'serverList':
                     const newStates: Record<string, ManagedServerState> = {};
                     message.servers.forEach((s) => {
                         newStates[s.id] = { ...s, toolFetchStatus: s.toolFetchStatus ?? 'idle', tools: s.tools ?? undefined };
                     });
                     setServerStates(newStates);
                     break;
                 case 'statusUpdate': {
                      const statusUpdateMsg = message as ServerStatusUpdate;
                      console.info(`[McpManagerContext] Received statusUpdate for ${statusUpdateMsg.serverId}:`, statusUpdateMsg); // Log received data
                      setServerStates((prev) => {
                        const existing = prev[statusUpdateMsg.serverId] || { id: statusUpdateMsg.serverId, label: 'Unknown', status: statusUpdateMsg.status, toolFetchStatus: 'idle' };
                        const newStateForServer = {
                            ...existing,
                            status: statusUpdateMsg.status,
                            error: statusUpdateMsg.error,
                            tools: statusUpdateMsg.tools !== undefined ? statusUpdateMsg.tools : existing.tools,
                            toolFetchStatus: statusUpdateMsg.toolFetchStatus !== undefined ? statusUpdateMsg.toolFetchStatus : existing.toolFetchStatus,
                        };
                        return { ...prev, [statusUpdateMsg.serverId]: newStateForServer };
                      });

                      // If tools were included in the update and the tool fetch is complete, automatically select them
                      if (statusUpdateMsg.tools && statusUpdateMsg.tools.length > 0 && 
                          statusUpdateMsg.toolFetchStatus === 'fetched') {
                          
                          // Add all new tools to selectedTools
                          setSelectedTools(prev => {
                              const newTools = statusUpdateMsg.tools?.map(tool => 
                                  `${statusUpdateMsg.serverId}/${tool.name}`
                              ) || [];
                              
                              // Create a set with previous and new tools (to avoid duplicates)
                              const combinedSet = new Set([...prev, ...newTools]);
                              return Array.from(combinedSet);
                          });
                      }
                     break;
                 }
                 // Removed 'toolList' case

                 case 'response':
                     const responseId = message.response.id;
                     // FIX: Check responseId is not null before using as map key
                     if (responseId === null) {
                         console.warn('[McpManagerContext] Null ID response received');
                         break;
                     }
                     const pending = pendingRequests.current.get(responseId);
                     if (pending) {
                          clearTimeout(pending.timer);
                          const response = message.response;
                          if ('error' in response) {
                               console.warn(`[McpManagerContext] MCP Error (ID: ${response.id}):`, response.error);
                               pending.reject(new McpError(response.error.message, response.error.code, response.error.data));
                           } else {
                               pending.resolve(response);
                           }
                          pendingRequests.current.delete(responseId);
                     } else {
                          console.warn(`[McpManagerContext] Unknown request ID: ${responseId}`);
                     }
                     break;
                 case 'notification':
                      const notification = message.notification;
                      if ('method' in notification && !('id' in notification)) {
                           console.info(`[McpManagerContext] MCP Notif (from ${message.serverId}):`, notification.method);
                      } else {
                           console.warn(`[McpManagerContext] Received non-notification message via 'notification' type from ${message.serverId}`);
                      }
                     break;
                 case 'stderr': console.info(`[McpManagerContext] MCP Stderr (from ${message.serverId}): ${message.data.trim()}`); break;
                 case 'error':
                     console.error(`[McpManagerContext] API Error: ${message.message}`); toast.error(`Manager Error: ${message.message}`);
                      if(message.originalRequestId && pendingRequests.current.has(message.originalRequestId)) {
                          const failedReq = pendingRequests.current.get(message.originalRequestId);
                          if(failedReq) { clearTimeout(failedReq.timer); failedReq.reject(new Error(`Backend API Error: ${message.message}`)); pendingRequests.current.delete(message.originalRequestId); }
                      }
                     break;
                 // --- Handle Chat Stream Messages ---
                 case 'chatChunk':
                 case 'toolStart':
                 case 'toolEnd':
                 case 'chatError':
                 case 'chatEnd':
                      if (chatStreamHandlers.current) {
                          // FIX: Handle chatEnd separately as it has no payload
                          if (message.type === 'chatEnd') {
                              chatStreamHandlers.current.onEnd();
                          } else if (message.type === 'chatError') { // Check payload existence for others
                              chatStreamHandlers.current.onError(new Error(message.payload.message));
                          } else if (message.type === 'chatChunk') {
                               chatStreamHandlers.current.onChunk({ type: 'chatChunk', content: message.payload.content });
                          } else if (message.type === 'toolStart') {
                               chatStreamHandlers.current.onChunk({ type: 'toolStart', toolCallId: message.payload.toolCallId, toolName: message.payload.toolName, toolInput: message.payload.toolInput });
                          } else if (message.type === 'toolEnd') {
                               chatStreamHandlers.current.onChunk({ type: 'toolEnd', toolCallId: message.payload.toolCallId, output: message.payload.output, isError: message.payload.isError });
                          }
                      } else {
                          console.warn(`[McpManagerContext] Received chat stream message but no handler is active: ${message.type}`);
                      }
                      if (message.type === 'chatEnd' || message.type === 'chatError') {
                          chatStreamHandlers.current = null;
                      }
                      break;
                 default:
                     // This ensures exhaustive checks for the *parsed message type*
                     const exhaustiveCheck: never = message;
                     console.warn(`[McpManagerContext] Unhandled message type: ${(exhaustiveCheck as any)?.type}`);
             }
         } catch (error: any) { console.error('[McpManagerContext] Failed processing message:', error.message); }
    };

    const removeSocketListeners = () => {
        if (socketInstance) {
            socketInstance.removeEventListener('open', handleOpen);
            socketInstance.removeEventListener('close', handleClose);
            socketInstance.removeEventListener('error', handleError);
            socketInstance.removeEventListener('message', handleMessage);
        }
    }

    socketInstance.addEventListener('open', handleOpen);
    socketInstance.addEventListener('close', handleClose);
    socketInstance.addEventListener('error', handleError);
    socketInstance.addEventListener('message', handleMessage);

    return () => {
        removeSocketListeners();
        if (!isOpen && ws.current !== socketInstance && socketInstance?.readyState !== WebSocket.CLOSED) {
            socketInstance?.close(1000, "Cleanup unsuccessful attempt");
        }
        if (!isOpen) { connectionAttemptActive.current = false; }
    };
  }, [sendMessage]);

  useEffect(() => {
    isUnmountingRef.current = false;
    const cleanupListeners = connectWebSocket();

    return () => {
        isUnmountingRef.current = true;
        console.info('[McpManagerContext] Provider unmounting - Cleaning up.');
        if (reconnectTimeout.current) { clearTimeout(reconnectTimeout.current); }
        pendingRequests.current.forEach(req => { clearTimeout(req.timer); req.reject(new Error("Component unmounted")); });
        pendingRequests.current.clear();
        chatStreamHandlers.current?.onError(new Error("Component unmounted"));
        chatStreamHandlers.current = null;
        const socketToClose = ws.current;
        ws.current = null;
        connectionAttemptActive.current = false;
        socketToClose?.close(1000, "Provider unmounting");
        cleanupListeners?.();
    };
  }, [connectWebSocket]);

  const connectToServer = useCallback((serverId: string) => {
      console.info(`[Context] Requesting connect for ${serverId}`);
      sendMessage({ type: 'connect', serverId });
  }, [sendMessage]);

  const disconnectFromServer = useCallback((serverId: string) => {
       console.info(`[Context] Requesting disconnect for ${serverId}`);
      sendMessage({ type: 'disconnect', serverId });
  }, [sendMessage]);

  // fetchToolsForServer removed

  const sendMcpRequest = useCallback(( serverId: string, request: Omit<JsonRpcRequest, 'jsonrpc' | 'id'> & { id?: string | number }, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT ): Promise<JsonRpcResponse> => {
      return new Promise((resolve, reject) => {
           if (wsStatus !== 'open') { return reject(new Error("WebSocket not open.")); }
           const requestId = request.id ?? generateUUID();
            if (pendingRequests.current.has(requestId)) { return reject(new Error(`Duplicate request ID: ${requestId}`)); }
            const timer = setTimeout(() => { pendingRequests.current.delete(requestId); console.error(`[McpManagerContext] Request ${requestId} timed out.`); reject(new Error(`Request timed out.`)); }, timeoutMs);
            pendingRequests.current.set(requestId, { resolve, reject, timer });
            sendMessage({ type: 'request', serverId, request: { ...request, id: requestId } });
      });
  }, [sendMessage, wsStatus]);

  const sendMcpNotification = useCallback(( serverId: string, notification: Omit<JsonRpcNotification, 'jsonrpc'> ) => {
    sendMessage({ type: 'notification', serverId, notification });
  }, [sendMessage]);

  // --- Correct sendChatPrompt function ---
  const sendChatPrompt = useCallback((
    payload: ChatRequestMessage['payload'], // Use correct type from api.types
    onChunk: (chunk: ChatStreamChunk) => void,
    onError: (error: Error) => void,
    onEnd: () => void
  ) => {
     // Use the ref defined in the component scope
     if (chatStreamHandlers.current) {
          console.warn("[McpManagerContext] Overwriting existing chat stream handler.");
          chatStreamHandlers.current.onError(new Error("New chat request started."));
     }
     chatStreamHandlers.current = { onChunk, onError, onEnd }; // Assign callbacks to the ref
     const messageToSend: ClientToServerMessage = { type: 'chatRequest', payload };
     sendMessage(messageToSend);
  }, [sendMessage]); // console is imported globally

  // --- CORRECTED contextValue memo ---
  const contextValue = useMemo(() => ({
    wsStatus,
    serverStates,
    connectToServer,
    disconnectFromServer,
    sendMcpRequest,
    sendMcpNotification,
    sendChatPrompt, // Ensure this refers to the actual function
    selectedTools,
    setSelectedTools // Ensure this is provided
  }), [
    wsStatus,
    serverStates,
    connectToServer,
    disconnectFromServer,
    sendMcpRequest,
    sendMcpNotification,
    sendChatPrompt, // Dependency on the actual function
    selectedTools,
    setSelectedTools // Dependency on the setter
  ]);


  return ( <McpManagerContext.Provider value={contextValue}> {children} </McpManagerContext.Provider> );
};

export function useMcpManager() {
  const context = useContext(McpManagerContext);
  if (context === undefined) { throw new Error('useMcpManager must be used within a McpManagerProvider'); }
  return context;
}

// McpError defined in mcp.types.ts now
// class McpError extends Error { ... }