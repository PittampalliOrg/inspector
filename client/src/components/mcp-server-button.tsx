"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { CheckCircle, XCircle, Loader, PlugZap, ServerOff, CheckSquare, Square, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useMcpManager } from "@/lib/contexts/McpManagerContext"
import { McpConnectionState } from "@/types/mcp.types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"

export function MCPServerButton() {
  const { wsStatus, serverStates, connectToServer, disconnectFromServer } = useMcpManager()

  // Change to array to support multi-server selection
  const [activeServerIds, setActiveServerIds] = useState<string[]>([])

  // Add a ref to track previous server states for animation effects
  const prevStatesRef = useRef<typeof serverStates>({})

  // Add state to track servers that just changed status
  const [changedServers, setChangedServers] = useState<Set<string>>(new Set())

  // Animation cleanup timeout
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Detect server state changes for visual feedback
  useEffect(() => {
    const newChangedServers = new Set<string>()

    // Compare current server states with previous states to detect changes
    Object.entries(serverStates).forEach(([id, state]) => {
      const prevState = prevStatesRef.current[id]
      if (prevState && prevState.status !== state.status) {
        newChangedServers.add(id)
      }
    })

    // Update changed servers if we found any
    if (newChangedServers.size > 0) {
      setChangedServers(newChangedServers)

      // Clear previous animation timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }

      // Clear the changed servers after animation completes
      animationTimeoutRef.current = setTimeout(() => {
        setChangedServers(new Set())
      }, 1500)
    }

    // Update the previous states ref for next comparison
    prevStatesRef.current = serverStates

    // Cleanup
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [serverStates])

  // Update activeServerIds when servers stop/fail/disconnect
  useEffect(() => {
    // First, filter out servers that are no longer running
    const updatedActiveIds = activeServerIds.filter(
      (id) => serverStates[id] && serverStates[id].status === McpConnectionState.Running,
    )

    // Then, find any running servers that should be auto-activated
    const newActiveIds = Object.entries(serverStates)
      .filter(([id, state]) => state.status === McpConnectionState.Running && !updatedActiveIds.includes(id))
      .map(([id]) => id)

    // Only update state if there's an actual change to avoid unnecessary renders
    if (updatedActiveIds.length !== activeServerIds.length || newActiveIds.length > 0) {
      setActiveServerIds([...updatedActiveIds, ...newActiveIds])
    }
  }, [serverStates]) // Removed activeServerIds from dependency array

  // Simplified handler to toggle server activation
  const toggleServer = useCallback(
    (id: string) => {
      const currentStatus = serverStates[id]?.status
      const isActive = activeServerIds.includes(id)

      if (isActive) {
        // Deactivate the server
        console.log(`[MCPServerButton] Deactivating server ${id}`)
        disconnectFromServer(id)
        setActiveServerIds((prev) => prev.filter((serverId) => serverId !== id))
      } else {
        // Activate the server
        if (currentStatus === McpConnectionState.Running) {
          // Just add to active list if already running
          console.log(`[MCPServerButton] Adding running server ${id} to active list`)
          setActiveServerIds((prev) => [...prev, id])
        } else if (currentStatus === McpConnectionState.Stopped || currentStatus === McpConnectionState.Failed) {
          // Connect the server and add to active list
          console.log(`[MCPServerButton] Activating server ${id}`)
          connectToServer(id)
          setActiveServerIds((prev) => [...prev, id])
        }
      }
    },
    [serverStates, activeServerIds, connectToServer, disconnectFromServer],
  )

  // New handlers for Select All / Deselect All
  const selectAllServers = useCallback(() => {
    const availableServerIds = Object.keys(serverStates)

    // Connect servers that aren't already running
    availableServerIds.forEach((id) => {
      const status = serverStates[id]?.status
      if (status !== McpConnectionState.Running && status !== McpConnectionState.Starting) {
        connectToServer(id)
      }
    })

    // Update active list
    setActiveServerIds(availableServerIds)
    toast.success("Connecting to all servers")
  }, [serverStates, connectToServer])

  const deselectAllServers = useCallback(() => {
    // Disconnect all active servers
    activeServerIds.forEach((id) => {
      disconnectFromServer(id)
    })

    // Clear active list
    setActiveServerIds([])
    toast.success("Disconnected from all servers")
  }, [activeServerIds, disconnectFromServer])

  // Count active servers
  const activeCount = activeServerIds.length

  // Count total available tools across all active servers
  const totalAvailableTools = Object.entries(serverStates)
    .filter(([id]) => activeServerIds.includes(id))
    .reduce((count, [_, server]) => {
      if (server.status === McpConnectionState.Running && server.tools) {
        return count + server.tools.length
      }
      return count
    }, 0)

  const hasConfigs = Object.keys(serverStates).length > 0
  const wsConnecting = wsStatus === "connecting"
  const wsDisconnected = wsStatus === "closed" || wsStatus === "error"

  // Status indicator logic - improved with more subtle colors for light mode
  const getStatusIndicator = () => {
    if (wsDisconnected) {
      return {
        color: "bg-destructive/50 dark:bg-destructive/70",
        icon: <ServerOff className="h-4 w-4 text-destructive/80" />,
        tooltip: "WebSocket Disconnected",
      }
    }
    if (wsConnecting) {
      return {
        color: "bg-amber-400/70 dark:bg-yellow-500",
        icon: <Loader className="h-4 w-4 animate-spin text-amber-500 dark:text-yellow-500" />,
        tooltip: "Connecting to WebSocket",
      }
    }
    if (activeCount > 0) {
      return {
        color: "bg-emerald-400/80 dark:bg-green-500",
        icon: <PlugZap className="h-4 w-4 text-emerald-500 dark:text-green-500" />,
        tooltip: `${activeCount} Server${activeCount !== 1 ? "s" : ""} Active`,
      }
    }
    return {
      color: "bg-muted-foreground/30",
      icon: <Server className="h-4 w-4 text-muted-foreground/70" />,
      tooltip: "No Active Servers",
    }
  }

  const statusIndicator = getStatusIndicator()

  // Get button variant based on state - more subtle for light mode
  const getButtonVariant = () => {
    if (wsDisconnected) return "destructive"
    if (activeCount > 0) return "outline" // Changed from "default" to "outline" for light mode
    return "secondary"
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={getButtonVariant()}
                  size="sm"
                  className={cn(
                    "flex items-center gap-2 h-9 px-3 min-w-[180px] justify-between transition-all duration-300",
                    !hasConfigs && "border-dashed",
                    wsConnecting && "animate-pulse",
                    // Add custom styling for active servers in light mode
                    activeCount > 0 &&
                      "border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-900/30",
                  )}
                  disabled={wsConnecting}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className={`relative flex h-2.5 w-2.5 mr-1`}>
                      <span
                        className={cn(
                          "relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-300",
                          statusIndicator.color,
                        )}
                      />
                      {(wsConnecting || activeCount > 0) && (
                        <span
                          className={cn(
                            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                            statusIndicator.color,
                          )}
                        />
                      )}
                    </div>
                    <span className="truncate font-medium">
                      {wsDisconnected
                        ? "MCP Disconnected"
                        : wsConnecting
                          ? "Connecting..."
                          : activeCount > 0
                            ? `${activeCount} MCP Server${activeCount !== 1 ? "s" : ""}`
                            : "MCP Servers"}
                    </span>
                  </div>
                  {activeCount > 0 && totalAvailableTools > 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-auto flex-shrink-0 text-xs transition-all duration-300",
                        "bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
                      )}
                    >
                      {totalAvailableTools} tool{totalAvailableTools !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{statusIndicator.tooltip}</TooltipContent>
          </Tooltip>

          <DropdownMenuContent align="end" className="min-w-[280px]">
            <DropdownMenuLabel className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {statusIndicator.icon}
                <span>MCP Servers</span>
              </div>
              <div className="flex gap-1 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    selectAllServers()
                  }}
                  disabled={wsConnecting || Object.keys(serverStates).length === 0}
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  <span className="sr-only md:not-sr-only">Select All</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    deselectAllServers()
                  }}
                  disabled={wsConnecting || activeCount === 0}
                >
                  <Square className="h-3.5 w-3.5 mr-1" />
                  <span className="sr-only md:not-sr-only">Deselect All</span>
                </Button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {Object.values(serverStates).length > 0 ? (
              Object.values(serverStates).map((state) => {
                const sId = state.id
                const sStatus = state.status
                const sError = state.error
                const sConnecting = sStatus === McpConnectionState.Starting
                const sConnected = sStatus === McpConnectionState.Running
                const sFailed = sStatus === McpConnectionState.Failed
                const isActive = activeServerIds.includes(sId)
                const isChanged = changedServers.has(sId)
                const toolCount = (state as any).tools?.length || 0

                return (
                  <DropdownMenuItem
                    key={sId}
                    onSelect={(e) => {
                      e.preventDefault()
                      toggleServer(sId)
                    }}
                    disabled={wsConnecting || sConnecting}
                    className={cn(
                      "flex justify-between items-center transition-all duration-300 px-3 py-2",
                      isChanged && "animate-highlight",
                      // More subtle highlighting for active servers in light mode
                      isActive && sConnected && "bg-emerald-50/70 dark:bg-primary/20",
                      sFailed && "text-destructive/80",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`relative flex h-2.5 w-2.5`}>
                        <span
                          className={cn(
                            "relative inline-flex rounded-full h-2.5 w-2.5",
                            sConnected && isActive
                              ? "bg-emerald-400 dark:bg-green-500"
                              : sConnected && !isActive
                                ? "bg-emerald-300/50 dark:bg-green-500/40"
                                : sFailed
                                  ? "bg-destructive/70"
                                  : sConnecting
                                    ? "bg-amber-400 dark:bg-yellow-500"
                                    : "bg-muted-foreground/30",
                          )}
                        />
                        {sConnecting && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400/70 dark:bg-yellow-500/70 opacity-75" />
                        )}
                        {sConnected && isActive && (
                          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 dark:bg-green-500/70 opacity-50" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "font-medium",
                          isActive && sConnected && "text-emerald-700 dark:text-foreground",
                          !isActive && sConnected && "text-muted-foreground",
                        )}
                      >
                        {state.label || sId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {sConnected && toolCount > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            isActive
                              ? "bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                              : "bg-muted/50",
                          )}
                        >
                          {toolCount} tool{toolCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                      {sConnected &&
                        (isActive ? (
                          <CheckCircle className="h-4 w-4 text-emerald-500 fill-emerald-100 dark:text-green-500 dark:fill-green-900/30" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-muted-foreground opacity-50" />
                        ))}
                      {sFailed && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <XCircle className="h-4 w-4 text-destructive/80 fill-destructive/10" />
                          </TooltipTrigger>
                          <TooltipContent side="left">{sError || "Connection failed"}</TooltipContent>
                        </Tooltip>
                      )}
                      {sConnecting && <Loader className="h-4 w-4 animate-spin text-amber-500 dark:text-yellow-500" />}
                    </div>
                  </DropdownMenuItem>
                )
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                <ServerOff className="mx-auto h-6 w-6 mb-2 opacity-50" />
                <p>No MCP servers configured</p>
                <p className="text-xs mt-1 max-w-[200px] mx-auto">
                  Add MCP server configurations to enable AI tool connections
                </p>
              </div>
            )}

            {(wsStatus === "closed" || wsStatus === "error") && (
              <div className="px-3 py-2 text-sm text-destructive/80 border-t border-border">
                <div className="flex items-center gap-2">
                  <ServerOff className="h-4 w-4" />
                  <span>WebSocket Disconnected</span>
                </div>
              </div>
            )}

            {wsConnecting && (
              <div className="px-3 py-2 text-sm text-amber-500 dark:text-yellow-500 border-t border-border">
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Connecting WebSocket...</span>
                </div>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}
