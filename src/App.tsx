// src/App.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MCPClient, Tool } from './mcpClient.ts';

interface Message {
  role: string;
  content: string;
}

interface MCPConfig {
  mcpServers: { [key: string]: { name: string; type: string; serverUrl: string } };
}

const App: React.FC = () => {
  const [config, setConfig] = useState<MCPConfig>({ mcpServers: {"MCPServer": {
      "name": "MCPServer",
      "type": "sse",
      "serverUrl": "http://192.168.0.103:8000/sse"
    },} });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [mcpClient, setMCPClient] = useState<MCPClient | null>(null);
  const [toolMessage, setToolMessage] = useState<string>('');

  useEffect(() => {
    if (Object.keys(config.mcpServers).length > 0) {
      const client = new MCPClient(config);
      client.connectToServers().then(() => {
        setMCPClient(client);
        setTools(client.availableTools);
      });
    }
  }, [config]);

  const handleConfigChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const newConfig = JSON.parse(event.target.value);
      setConfig(newConfig);
    } catch (error) {
      console.error('Invalid JSON:', error);
    }
  };

  const handleSendMessage = async () => {
    if (input.trim() === '') return;
    let role: string = "user";
    let newMessages: Message[] = [...messages, { role, content: input }];
    if (toolMessage !== '') {
      role = "function";
      newMessages = [...messages, { role, content: toolMessage }];
      setToolMessage('');
    } else {
      setMessages(newMessages);
      setInput('');
    }

    try {
      const response = await axios.post('http://localhost:8080/v1/chat/completions', {
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
      var debugresponse = JSON.stringify(response);
      console.log("Response:" + debugresponse)
      //check finish reason for tool call. 
      if (response.data.choices[0].finish_reason === 'tool_calls') {
        const toolCalls = response.data.choices[0].message.tool_calls;
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolInput = toolCall.function.arguments;
          const toolResponse = await mcpClient?.callTool(toolName, toolInput);
          const toolMessageContent = {
            role: "function",
            content: toolResponse,
          };
          setToolMessage(toolResponse);
          setToolMsg(toolMessageContent);
          handleSendMessage();
          return;
        }
      }
      const content = response.data.choices[0].message.content;
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: 'Failed to send message.' }]);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
    <h1>MCP Chat App</h1>
      <h2>Available Tools</h2>
      <ul>
        {tools.map(tool => (
          <li key={tool.name}>
            <strong>{tool.name}</strong>: {tool.description} 
          </li>
        ))}
      </ul>
      <h2>Chat</h2>
      <div style={{ marginBottom: '20px' }}>
        {messages.map((msg, index) => (
          <div key={index}>
            <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type your message here"
        style={{ width: '80%', marginRight: '10px' }}
      />
      <button onClick={handleSendMessage}>Send</button>
    </div>
  );
};

export default App;
