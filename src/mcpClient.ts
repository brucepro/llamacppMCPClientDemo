// src/mcpClient.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export class MCPClient {
  mcpServers: { [key: string]: { name: string; type: string; serverUrl: string } };
  availableTools: Tool[];
  clients: { [key: string]: Client };

  constructor(mcpServers: { [key: string]: { name: string; type: string; serverUrl: string } }) {
    this.mcpServers = mcpServers;
    this.availableTools = [];
    this.clients = {};
  }

  async connectToServers() {
    for (const key in this.mcpServers.mcpServers) {
      if (this.mcpServers.mcpServers.hasOwnProperty(key)) {
        const server = this.mcpServers.mcpServers[key];
        try {
          const transport = new SSEClientTransport(new URL(server.serverUrl));
          transport.onmessage = this.handleServerMessage.bind(this);
          transport.onerror = this.handleServerError.bind(this);
          //await transport.start();
          const client = new Client(
            { name: 'example-client', version: '0.1.0' },
            { capabilities: {} },
          );
          await client.connect(transport);
          this.clients[server.name] = client;
          const toolsResponse = await client.listTools();
          console.log(toolsResponse);
          this.availableTools = this.availableTools.concat(toolsResponse.tools.map((x: any) => ({
            name: x.name,
            description: x.description,
            inputSchema: x.inputSchema,
          })));
        } catch (error) {
          console.error(`Error connecting to server ${server.name}:`, error);
        }
      }
    }
  }

  handleServerMessage(message: any) {
    console.log('Received server message:', message);
  }

  handleServerError(error: any) {
    console.error('Server error:', error);
  }

  async callTool(toolName: string, input: any) {
    console.log("Calling tool:" + toolName + "Input:" + input)
    for (const client of Object.values(this.clients)) {
      const tools = await client.listTools();
      const tool = tools.tools.find((t: any) => t.name === toolName);
      if (tool) {
        return await client.callTool({ name: toolName, arguments: input });
      }
    }
    throw new Error(`Tool ${toolName} not found`);
  }
}

export interface Tool {
  name: string;
  description:string;
  inputSchema: any;
  
}
