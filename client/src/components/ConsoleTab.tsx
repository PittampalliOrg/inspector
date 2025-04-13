import { Tabs, TabsContent, TabsList, TabsTrigger  } from "@/components/ui/tabs"

const ConsoleTab = () => (
  <Tabs defaultValue="console">
        <TabsList>
      <TabsTrigger value="console">Console</TabsTrigger>
    </TabsList>
  <TabsContent value="console" className="h-96">
    <div className="bg-gray-900 text-gray-100 p-4 rounded-lg h-full font-mono text-sm overflow-auto">
      <div className="opacity-50">Welcome to MCP Client Console</div>
      {/* Console output would go here */}
    </div>
  </TabsContent>
  </Tabs>
);

export default ConsoleTab;
