// mcpSSEClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";


export interface McpServerConfig {
  name: string;
  type: string;
  serverUrl: string;
  connectionStatus: string;
  maxToolCalls: number;
  promptForToolUse: boolean;
}

interface McpClientDict {
  [serverName: string]: {
    client: Client;
    tools: any[];
    prompts: any[];
    resources: any[];
    connectionStatus: string;
    error?: string;
    maxToolCalls: number;
    promptForToolUse: boolean;
  };
}

export class McpSSEClient {
  public _clients: McpClientDict = {};
  private _toolServerMap: { [toolName: string]: string } = {};
  private _promptServerMap: { [promptName: string]: string } = {};
  private _resourceServerMap: { [resourceName: string]: string } = {};

  constructor(private _serverConfigs: McpServerConfig[]) {}

  async initializeClients(): Promise<{ success: boolean, error?: string }> {
    for (const config of this._serverConfigs) {
      console.log("Server Config:", config);
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
            prompts: {},
            resources: {},
          },
        }
      );
      transport.onerror = (error) => {
        console.error('SSE transport error:', error);
        this.setError(config.name, (error as Error).message);
        this.setConnectionStatus(config.name, 'Error');
      };

      transport.onclose = () => {
        console.log('SSE transport closed');
        this.setConnectionStatus(config.name, 'Disconnected');
      };

      transport.onmessage = (message) => {
        console.log('Message received:', message);
      };

      try {
        await client.connect(transport);
        console.log(`Client connected to server ${config.name}`);
        const toolsResult = await client.listTools();
        const promptsResult = await client.listPrompts();
        const resourcesResult = await client.listResources();

        this._clients[config.name] = {
          client,
          tools: toolsResult?.tools?.map(tool => ({ ...tool, serverName: config.name })) || [],
          prompts: promptsResult?.prompts?.map(prompt => ({ ...prompt, serverName: config.name })) || [],
          resources: resourcesResult?.resources?.map(resource => ({ ...resource, serverName: config.name })) || [],
          connectionStatus: 'Connected',
          maxToolCalls: config.maxToolCalls,
          promptForToolUse: config.promptForToolUse,
        };

        // Create a mapping of tool names to their respective server names
        toolsResult?.tools?.forEach((tool) => {
          this._toolServerMap[`${config.name}.${tool.name}`] = config.name;
        });
        // Create a mapping of prompt names to their respective server names
        promptsResult?.prompts?.forEach((prompt) => {
          this._promptServerMap[`${config.name}.${prompt.name}`] = config.name;
        });
        // Create a mapping of resource names to their respective server names
        resourcesResult?.resources?.forEach((resource) => {
          this._resourceServerMap[`${resource.uri}.${config.name}`] = config.name;
        });

        console.log(`Initialized client for server ${config.name} successfully.`);
      } catch (error) {
        console.error(`Failed to initialize client for server ${config.name}:`, error);
        this.setConnectionStatus(config.name, 'Error');
        this.setError(config.name, (error as Error).message);
        return { success: false, error: (error as Error).message };
      }
    }
    return { success: true };
  }

  getAvailableTools(): Tool[] {
    const tools = Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.tools.map(tool => ({ ...tool, full_name: `${clientInfo.client.name}.${tool.name}` }))
    );
    return tools;
  }

  getAvailablePrompts(): Prompt[] {
    const prompts = Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.prompts.map(prompt => ({ ...prompt, full_name: `${clientInfo.client.name}.${prompt.name}` }))
    );
    return prompts;
  }

  getAvailableResources(): Resource[] {
    const resources = Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.resources.map(resource => ({ ...resource, full_name: `${clientInfo.client.name}.${resource.name}` }))
    );
    return resources;
  }

  async callTool(args: any): Promise<any> {
    console.log(args);
    const serverName = this._toolServerMap[args.name];
    if (!serverName) {
      console.error(`Tool ${args.name} not found.`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }

    const tool = clientInfo.tools.find(tool => tool.name === args.name);
    if (!tool) {
      console.error(`Tool ${args.name} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.callTool(args);
    } catch (error) {
      console.error(`Error calling tool ${args.name} on server ${serverName}:`, error);
      return undefined;
    }
  }

   async getPrompt(params: any): Promise<any> {
    const serverName = this._promptServerMap[params.name];
    if (!serverName) {
      console.error(`Prompt ${params.name} not found.`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }
    const prompt = clientInfo.prompts.find(prompt => prompt.name === params.name);
    if (!prompt) {
      console.error(`Prompt ${params.name} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.getPrompt(params);
    } catch (error) {
      console.error(`Error getting prompt ${params.name} from server ${serverName}:`, error);
      return undefined;
    }
  }

 async readResource(params: any): Promise<any> {
    const serverName = this._resourceServerMap[params.name];
    if (!serverName) {
      console.error(`Resource ${params.name} not found.`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }
    const resource = clientInfo.resources.find(resource => resource.name === params.name);
    if (!resource) {
      console.error(`Resource ${params.name} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.readResource(params);
    } catch (error) {
      console.error(`Error reading resource ${params.name} from server ${serverName}:`, error);
      return undefined;
    }
  }

  async closeAllConnections(): Promise<void> {
    for (const clientInfo of Object.values(this._clients)) {
      await clientInfo.client.close();
    }
  }
  
  private setConnectionStatus(serverName: string, status: string) {
    this._clients[serverName].connectionStatus = status;
  }

  private setError(serverName: string, error: string) {
    this._clients[serverName].error = error;
  }
}
