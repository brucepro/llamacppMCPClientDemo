// mcpSSEClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsResultSchema, CallToolRequest, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

interface McpServerConfig {
  name: string;
  type: string;
  serverUrl: string;
}

interface McpClientDict {
  [serverName: string]: {
    client: Client;
    tools: any[];
    prompts: any[];
    resources: any[];
  };
}

export class McpSSEClient {
  private _clients: McpClientDict = {};
  private _toolServerMap: { [toolName: string]: string } = {};

  constructor(private _serverConfigs: McpServerConfig[]) {}

  async initializeClients(): Promise<{ success: boolean, error?: string }> {
    for (const config of this._serverConfigs) {
      if (config.type !== "sse") {
        console.warn(`Unsupported transport type: ${config.type}. Skipping server ${config.name}.`);
        continue;
      }

      const transport = new SSEClientTransport(new URL(config.serverUrl));
      const client = new Client({
          name: "MCP React Client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
      transport.onerror = (error) => {
        console.error('SSE transport error:', error);
        return { success: false, error: error.message };
      };

      transport.onclose = () => {
        console.log('SSE transport closed');
      };

      transport.onmessage = (message) => {
        console.log('Message received:', message);
      };

      try {
        await client.connect(transport);
        const toolsResult = await client.listTools();
        const promptsResult = await client.listPrompts();
        const resourcesResult = await client.listResources();

        this._clients[config.name] = {
          client,
          tools: toolsResult?.tools || [],
          prompts: promptsResult?.prompts || [],
          resources: resourcesResult?.resources || [],
        };

        // Create a mapping of tool names to their respective server names
        toolsResult?.tools.forEach((tool) => {
          this._toolServerMap[tool.name] = config.name;
        });

        console.log(`Initialized client for server ${config.name} successfully.`);
      } catch (error) {
        console.error(`Failed to initialize client for server ${config.name}:`, error);
        return { success: false, error: error.message };
      }
    }
    return { success: true };
  }

  getAvailableTools(): any[] {
    return Object.values(this._clients).flatMap(clientInfo => clientInfo.tools);
  }

  async callTool(params: CallToolRequest): Promise<CallToolResultSchema | undefined> {
    console.log(params);
    const serverName = this._toolServerMap[params.name];
    if (!serverName) {
      console.error(`Tool ${params.name} not found.`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }

    const tool = clientInfo.tools.find(tool => tool.name === params.name);
    if (!tool) {
      console.error(`Tool ${params.name} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.callTool(params, CallToolResultSchema);
    } catch (error) {
      console.error(`Error calling tool ${params.name} on server ${serverName}:`, error);
      return undefined;
    }
  }

  async closeAllConnections(): Promise<void> {
    for (const clientInfo of Object.values(this._clients)) {
      await clientInfo.client.close();
    }
  }
}
