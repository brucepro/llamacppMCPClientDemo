import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  Tool,
  Prompt,
  Resource,
} from '../utils/types';

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
    tools: Tool[];
    prompts: Prompt[];
    resources: Resource[];
    connectionStatus: string;
    error?: string;
    maxToolCalls: number;
    promptForToolUse: boolean;
  };
}

export class McpSSEClient {
  public _clients: McpClientDict = {};
  

  constructor(private _serverConfigs: McpServerConfig[]) {}

  public async initializeClients(): Promise<{ success: boolean, error?: string }> {
    await this.closeAllConnections();
    this._clients = {}; 
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
          tools: toolsResult?.tools?.map(tool => ({ 
          ...tool, 
          serverName: config.name, 
          full_name: `${config.name}.${tool.name}`,
          description: tool.description ?? '', 
        })) || [],
          prompts: promptsResult?.prompts?.map(prompt => ({ 
          ...prompt, 
          serverName: config.name, 
          full_name: `${config.name}.${prompt.name}`,
          inputSchema: prompt.inputSchema ?? {}, 
          description: prompt.description ?? '',
        })) || [],
          resources: resourcesResult?.resources?.map(resource => ({ ...resource, serverName: config.name, full_name: `${config.name}.${resource.name}` })) || [],
          connectionStatus: 'Connected',
          maxToolCalls: config.maxToolCalls,
          promptForToolUse: config.promptForToolUse,
        };

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
  
  getAvailableTools = (): Tool[] => {
    return Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.tools.map(tool => ({ ...tool, full_name: `${tool.serverName}.${tool.name}` }))
    );
  }

  getAvailablePrompts = (): Prompt[] => {
    return Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.prompts.map(prompt => ({ ...prompt, full_name: `${prompt.serverName}.${prompt.name}` }))
    );
  }

  getAvailableResources = (): Resource[] => {
    return Object.values(this._clients).flatMap(clientInfo => 
      clientInfo.resources.map(resource => ({ ...resource, full_name: `${resource.serverName}.${resource.name}` }))
    );
  }

  async callTool(args: { name: string; arguments: any }): Promise<any> {
    console.log(args);
    const [serverName, toolName] = args.name.split('.'); // Split servername.toolname
    if (!serverName || !toolName) {
      console.error(`Invalid tool name format: ${args.name}`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }

    const tool = clientInfo.tools.find(tool => tool.name === toolName);
    if (!tool) {
      console.error(`Tool ${toolName} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.callTool({ name: toolName, arguments: args.arguments }); // Use toolName here
    } catch (error) {
      console.error(`Error calling tool ${toolName} on server ${serverName}:`, error);
      return undefined;
    }
  }

  async getPrompt(params: { name: string }): Promise<any> {
    const [serverName, promptName] = params.name.split('.'); // Split servername.promptname
    if (!serverName || !promptName) {
      console.error(`Invalid prompt name format: ${params.name}`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }
    const prompt = clientInfo.prompts.find(prompt => prompt.name === promptName);
    if (!prompt) {
      console.error(`Prompt ${promptName} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.getPrompt({ name: promptName }); // Use promptName here
    } catch (error) {
      console.error(`Error getting prompt ${promptName} from server ${serverName}:`, error);
      return undefined;
    }
  }

  async readResource(params: { name: string; uri: string }): Promise<any> {
    const [serverName, resourceName] = params.name.split('.'); // Split servername.resourcename
    if (!serverName || !resourceName) {
      console.error(`Invalid resource name format: ${params.name}`);
      return undefined;
    }
    const clientInfo = this._clients[serverName];
    if (!clientInfo) {
      console.error(`No client found for server ${serverName}.`);
      return undefined;
    }
    const resource = clientInfo.resources.find(resource => resource.name === resourceName);
    if (!resource) {
      console.error(`Resource ${resourceName} not found on server ${serverName}.`);
      return undefined;
    }
    try { 
      return await clientInfo.client.readResource({ uri: params.uri }); // Use uri from params here
    } catch (error) {
      console.error(`Error reading resource ${resourceName} from server ${serverName}:`, error);
      return undefined;
    }
  }

  public async closeAllConnections(): Promise<void> {
    for (const clientInfo of Object.values(this._clients)) {
      await clientInfo.client.close();
    }
    this._clients = {}; 
  }
  
  private setConnectionStatus(serverName: string, status: string) {
    this._clients[serverName].connectionStatus = status;
  }

  private setError(serverName: string, error: string) {
    this._clients[serverName].error = error;
  }
}
