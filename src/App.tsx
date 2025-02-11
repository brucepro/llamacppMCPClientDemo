// App.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { McpSSEClient, McpServerConfig } from './mcpSSEClient.ts';
import ChatComponent from './ChatComponent.tsx';
import ConfigComponent from './ConfigComponent.tsx';

const App: React.FC = () => {
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
  const [input, setInput] = useState<string>('');
  const [toolMessage, setToolMessage] = useState<string>('');
  const [tools, setTools] = useState<any[]>([]);
  const [serverConfigs, setServerConfigs] = useState<McpServerConfig[]>([
    {"name": "MCPServer", "type": "sse", "serverUrl": "http://localhost:8000/sse"},
    {"name": "MCPServer2", "type": "sse", "serverUrl": "http://localhost:8001/sse"},
  ]);
  const [mcpClient, setMcpClient] = useState<McpSSEClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [error, setError] = useState<string | undefined>(undefined);
  const maxToolCalls = 5; // Maximum number of tool calls to prevent infinite loops

  useEffect(() => {
    const client = new McpSSEClient(serverConfigs);
    client.initializeClients().then((result) => {
      if (result.success) {
        setTools(client.getAvailableTools());
        setMcpClient(client);
        setConnectionStatus('Connected');
      } else {
        setConnectionStatus('Error');
        setError(result.error);
      }
    });

    return () => {
      if (mcpClient) {
        mcpClient.closeAllConnections();
      }
    };
  }, [serverConfigs]);

  const handleSendMessage = async () => {
  let newMessages = [...messages];
  let toolCallCount = 0;

  if (input !== '') {
    newMessages = [...newMessages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
  }

  try {
    while (true) {
      console.log("NewMessages:")
      console.log(newMessages)
      var response = await axios.post('http://localhost:8080/v1/chat/completions', {
        messages: newMessages,
        model: '',
        tools: tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      });

      console.log(response.data.choices[0]);
      var finishReason = response.data.choices[0].finish_reason;

      if (finishReason === 'tool_calls') {
        console.log("Processing tool call");

        const toolCalls = response.data.choices[0].message.tool_calls;
        
        const calltoolMessageContent = {
            role: "assistant",
            "tool_calls":toolCalls,
            content: '',
          };
        newMessages = [...newMessages, calltoolMessageContent];
        for (const toolCall of toolCalls) {
          if (toolCallCount >= maxToolCalls) {
            console.error("Max tool calls reached. Stopping further tool calls.");
            setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: 'Max tool calls reached. Stopping further tool calls.' }]);
            return;
          }

          const toolParams: CallToolRequest = {
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}'),
          };

          const toolResponse = await mcpClient?.callTool(toolParams);
          
          const toolMessageContent = {
            tool_call_id: '',
            role: "tool",
            name:toolCall.function.name,
            content: toolResponse?.content[0]?.text || 'Tool failed to execute.',
          };

          newMessages = [...newMessages, toolMessageContent];
          finishReason = "";
          response = "";
          toolCallCount++;
        }
      } else if (finishReason === 'stop' || finishReason === 'length') {
        // Append the assistant's message to the message history
        const content = response.data.choices[0].message.content;
        newMessages = [...newMessages, { role: 'assistant', content }];
        break;
      }
    }

    setMessages(newMessages);
  } catch (error) {
    console.error('Error sending message:', error);
    setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: 'Failed to send message.' }]);
    setConnectionStatus('Error');
    setError(error.message);
  }
};


  const handleConfigSave = (newConfigs: McpServerConfig[]) => {
    setServerConfigs(newConfigs);
    if (mcpClient) {
      mcpClient.closeAllConnections().then(() => {
        const newClient = new McpSSEClient(newConfigs);
        newClient.initializeClients().then((result) => {
          if (result.success) {
            setTools(newClient.getAvailableTools());
            setMcpClient(newClient);
            setConnectionStatus('Connected');
          } else {
            setConnectionStatus('Error');
            setError(result.error);
          }
        });
      });
    }
  };

  const deleteServerConfig = (index: number) => {
    const newConfigs = serverConfigs.filter((_, i) => i !== index);
    setServerConfigs(newConfigs);
    if (mcpClient) {
      mcpClient.closeAllConnections().then(() => {
        const newClient = new McpSSEClient(newConfigs);
        newClient.initializeClients().then((result) => {
          if (result.success) {
            setTools(newClient.getAvailableTools());
            setMcpClient(newClient);
            setConnectionStatus('Connected');
          } else {
            setConnectionStatus('Error');
            setError(result.error);
          }
        });
      });
    }
  };

  return (
    <div>
      <h1>MCP Chat Interface</h1>
      <p>Connection Status: {connectionStatus}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <ConfigComponent 
        serverConfigs={serverConfigs} 
        onConfigSave={handleConfigSave} 
        onDeleteServer={deleteServerConfig} 
      />
      <ChatComponent 
        messages={messages} 
        input={input} 
        setInput={setInput} 
        onSendMessage={handleSendMessage} 
      />
    </div>
  );
};

export default App;
