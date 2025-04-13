import type React from "react"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"
import type { Metadata } from "next"
import { McpManagerProvider } from '@/lib/contexts/McpManagerContext';

export const metadata: Metadata = {
  title: "MCP Inspector",
  description: "Client-side application for the Model Context Protocol inspector",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/mcp.svg" />
      </head>
      <body>
        <McpManagerProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </McpManagerProvider>
      </body>
    </html>
  )
}
