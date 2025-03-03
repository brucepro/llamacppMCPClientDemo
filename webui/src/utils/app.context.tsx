import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  APIMessage,
  CanvasData,
  Conversation,
  Message,
  PendingMessage,
  ViewingChat,
  Tool,
  Prompt,
  Resource,
} from './types';
import StorageUtils from './storage';
import {
  filterThoughtFromMsgs,
  normalizeMsgsForAPI,
  getSSEStreamAsync,
} from './misc';
import { BASE_URL, CONFIG_DEFAULT, isDev } from '../Config';
import { matchPath, useLocation, useNavigate } from 'react-router';
import { McpSSEClient, McpServerConfig  } from '../mcp/mcpSSEClient.ts';



interface AppContextValue {
  // conversations and messages
  viewingChat: ViewingChat | null;
  pendingMessages: Record<Conversation['id'], PendingMessage>;
  isGenerating: (convId: string) => boolean;
  sendMessage: (
    convId: string | null,
    leafNodeId: Message['id'] | null,
    content: string,
    extra: Message['extra'],
    onChunk: CallbackGeneratedChunk
  ) => Promise<boolean>;
  stopGenerating: (convId: string) => void;
  replaceMessageAndGenerate: (
    convId: string,
    parentNodeId: Message['id'], // the parent node of the message to be replaced
    content: string | null,
    extra: Message['extra'],
    onChunk: CallbackGeneratedChunk
  ) => Promise<void>;

  // canvas
  canvasData: CanvasData | null;
  setCanvasData: (data: CanvasData | null) => void;

  // config
  config: typeof CONFIG_DEFAULT;
  saveConfig: (config: typeof CONFIG_DEFAULT) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  
  // MCP Server Configs
  serverConfigs: McpServerConfig[];
  setServerConfigs: (configs: McpServerConfig[]) => void;

  // MCP Client
  mcpClient: McpSSEClient | null;
  setMcpClient: (client: McpSSEClient | null) => void;
  
  // Tools, Prompts, Resources
  tools: any[];
  setTools: (tools: any[]) => void;
  prompts: any[];
  setPrompts: (prompts: any[]) => void;
  resources: any[];
  setResources: (resources: any[]) => void;
  
  // MCP Tool Call Approval
  showToolCallApprovalDialog: boolean;
  setShowToolCallApprovalDialog: (show: boolean) => void;
  toolCallApprovalParams: any;
  setToolCallApprovalParams: (params: any) => void;
  handleToolCallApproval: (approved: boolean) => void;
  
  // Connection Status and Error
  connectionStatus: string;
  setConnectionStatus: (status: string) => void;
  error: string | undefined;
  setError: (error: string | undefined) => void;

  // Additional Context - consider migrating to the same code/vars used for the file upload that is in progress
  additionalContext: { uri: string, description?: string }[];
  setAdditionalContext: (context: { uri: string, description?: string }[]) => void;
}




// this callback is used for scrolling to the bottom of the chat and switching to the last node
export type CallbackGeneratedChunk = (currLeafNodeId?: Message['id']) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AppContext = createContext<AppContextValue>({} as any);

const getViewingChat = async (convId: string): Promise<ViewingChat | null> => {
  const conv = await StorageUtils.getOneConversation(convId);
  if (!conv) return null;
  return {
    conv: conv,
    // all messages from all branches, not filtered by last node
    messages: await StorageUtils.getMessages(convId),
  };
};

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const params = matchPath('/chat/:convId', pathname);
  const convId = params?.params?.convId;

  const [viewingChat, setViewingChat] = useState<ViewingChat | null>(null);
  const [pendingMessages, setPendingMessages] = useState<
    Record<Conversation['id'], PendingMessage>
  >({});
  const [aborts, setAborts] = useState<
    Record<Conversation['id'], AbortController>
  >({});
  const [config, setConfig] = useState(StorageUtils.getConfig());
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // MCP Server Configs
  const [serverConfigs, setServerConfigs] = useState<McpServerConfig[]>(StorageUtils.getServerConfigs());

  // MCP Client
  const [mcpClient, setMcpClient] = useState<McpSSEClient | null>(null);

  // Tools, Prompts, Resources
  // MCP Tool Call Approval
  const [showToolCallApprovalDialog, setShowToolCallApprovalDialog] = useState(false);
  const [toolCallApprovalParams, setToolCallApprovalParams] = useState<any>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  // Connection Status and Error
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [error, setError] = useState<string | undefined>(undefined);

  // Additional Context
  const [additionalContext, setAdditionalContext] = useState<{ uri: string, description?: string }[]>([]);

  // handle change when the convId from URL is changed
  useEffect(() => {
    // also reset the canvas data
    setCanvasData(null);
    const handleConversationChange = async (changedConvId: string) => {
      if (changedConvId !== convId) return;
      setViewingChat(await getViewingChat(changedConvId));
    };
    StorageUtils.onConversationChanged(handleConversationChange);
    getViewingChat(convId ?? '').then(setViewingChat);
    return () => {
      StorageUtils.offConversationChanged(handleConversationChange);
    };
  }, [convId]);

  const setPending = (convId: string, pendingMsg: PendingMessage | null) => {
    // if pendingMsg is null, remove the key from the object
    if (!pendingMsg) {
      setPendingMessages((prev) => {
        const newState = { ...prev };
        delete newState[convId];
        return newState;
      });
    } else {
      setPendingMessages((prev) => ({ ...prev, [convId]: pendingMsg }));
    }
  };

  const setAbort = (convId: string, controller: AbortController | null) => {
    if (!controller) {
      setAborts((prev) => {
        const newState = { ...prev };
        delete newState[convId];
        return newState;
      });
    } else {
      setAborts((prev) => ({ ...prev, [convId]: controller }));
    }
  };
  
  // Initialize MCP Client if enabled
  useEffect(() => {
    console.log("MCP Enabled:", config.mcpEnabled);
    if (config.mcpEnabled) {
      console.log("Server Configs:", serverConfigs);
      const client = new McpSSEClient(serverConfigs);
      client.initializeClients().then((result) => {
        if (result.success) {
          setTools(client.getAvailableTools());
          setPrompts(client.getAvailablePrompts());
          setResources(client.getAvailableResources());
          setMcpClient(client);
          setConnectionStatus('Connected');
          console.log("Available Tools:", client.getAvailableTools());
          console.log("Available Prompts:", client.getAvailablePrompts());
          console.log("Available Resources:", client.getAvailableResources());
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
    } else {
      // If MCP is not enabled, ensure the client is closed and reset state
      if (mcpClient) {
        mcpClient.closeAllConnections();
        setMcpClient(null);
        setTools([]);
        setPrompts([]);
        setResources([]);
        setConnectionStatus('Disconnected');
        setError(undefined);
      }
    }
  }, [config.mcpEnabled]);

  ////////////////////////////////////////////////////////////////////////
  // public functions

  const isGenerating = (convId: string) => !!pendingMessages[convId];

  const handleToolCallApproval = async (approved: boolean) => {
    setShowToolCallApprovalDialog(false);
    let toolResponse = "";
    if (approved) {
      if (mcpClient) {
        try {
          toolResponse = await mcpClient.callTool(toolCallApprovalParams);
          console.log(toolResponse);
        } catch (error) {
          console.error(`Error calling tool: ${error}`);
          toolResponse = 'Tool failed to execute.';
        }
      }
    } else {
      toolResponse = 'User denied tool use';
    }

    const toolMessageContent = {
      tool_call_id: toolCallApprovalParams.id || ' ',
      role: "tool",
      name: toolCallApprovalParams.name,
      content: JSON.stringify(toolResponse),
    };

    if (toolResponse !== undefined) {
      const pendingMsg = {
        ...pendingMessages[convId ?? ''],
        content: JSON.stringify(toolMessageContent),
      };

      setPendingMessages((prev) => ({
        ...prev,
        [convId ?? '']: pendingMsg,
      }));

      // Send the tool response back to the LLM
      if (convId && viewingChat) {
        const leafNodeId = viewingChat.messages.at(-1)?.id ?? null;
        await sendMessage(convId, leafNodeId, JSON.stringify(toolMessageContent), [], () => {});
      }
    }
  };



  const generateMessage = async (
    convId: string,
    leafNodeId: Message['id'],
    onChunk: CallbackGeneratedChunk
  ) => {
    if (isGenerating(convId)) return;
    let toolCallCount = 0;
    const config = StorageUtils.getConfig();
    const currConversation = await StorageUtils.getOneConversation(convId);
    if (!currConversation) {
      throw new Error('Current conversation is not found');
    }

    const currMessages = StorageUtils.filterByLeafNodeId(
      await StorageUtils.getMessages(convId),
      leafNodeId,
      false
    );
    const abortController = new AbortController();
    setAbort(convId, abortController);

    if (!currMessages) {
      throw new Error('Current messages are not found');
    }

    const pendingId = Date.now() + 1;
    let pendingMsg: PendingMessage = {
      id: pendingId,
      convId,
      type: 'text',
      timestamp: pendingId,
      role: 'assistant',
      content: null,
      parent: leafNodeId,
      children: [],
    };
    setPending(convId, pendingMsg);

    try {
      // prepare messages for API
      let messages: APIMessage[] = [
        ...(config.systemMessage.length === 0
          ? []
          : [{ role: 'system', content: config.systemMessage } as APIMessage]),
        ...normalizeMsgsForAPI(currMessages),
      ];
      if (config.excludeThoughtOnReq) {
        messages = filterThoughtFromMsgs(messages);
      }
      if (isDev) console.log({ messages });

      // prepare params
      let params = {
        messages,
        stream: true,
        cache_prompt: true,
        samplers: config.samplers,
        temperature: config.temperature,
        dynatemp_range: config.dynatemp_range,
        dynatemp_exponent: config.dynatemp_exponent,
        top_k: config.top_k,
        top_p: config.top_p,
        min_p: config.min_p,
        typical_p: config.typical_p,
        xtc_probability: config.xtc_probability,
        xtc_threshold: config.xtc_threshold,
        repeat_last_n: config.repeat_last_n,
        repeat_penalty: config.repeat_penalty,
        presence_penalty: config.presence_penalty,
        frequency_penalty: config.frequency_penalty,
        dry_multiplier: config.dry_multiplier,
        dry_base: config.dry_base,
        dry_allowed_length: config.dry_allowed_length,
        dry_penalty_last_n: config.dry_penalty_last_n,
        max_tokens: config.max_tokens,
        timings_per_token: !!config.showTokensPerSecond,
        ...(config.custom.length ? JSON.parse(config.custom) : {}),
      };
      
      // If MCP is enabled, add tools to the params and turn off streaming
      if (config.mcpEnabled && mcpClient) {
        params.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.full_name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));
        params.stream = false; // turn off streaming for tool use
      }
      console.log("Message to LLM");
      console.log(params);
      // send request
      const fetchResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(params),
        signal: abortController.signal,
      });

      if (!config.mcpEnabled) {
        if (fetchResponse.status !== 200) {
          const body = await fetchResponse.json();
          throw new Error(body?.error?.message || 'Unknown error');
        }
        const chunks = getSSEStreamAsync(fetchResponse);
        for await (const chunk of chunks) {
          // const stop = chunk.stop;
          if (chunk.error) {
            throw new Error(chunk.error?.message || 'Unknown error');
          }
          const addedContent = chunk.choices[0].delta.content;
          const lastContent = pendingMsg.content || '';
          if (addedContent) {
            pendingMsg = {
              ...pendingMsg,
              content: lastContent + addedContent,
            };
          }
          const timings = chunk.timings;
          if (timings && config.showTokensPerSecond) {
            // only extract what's really needed, to save some space
            pendingMsg.timings = {
              prompt_n: timings.prompt_n,
              prompt_ms: timings.prompt_ms,
              predicted_n: timings.predicted_n,
              predicted_ms: timings.predicted_ms,
            };
          }
          setPending(convId, pendingMsg);
          onChunk(); // don't need to switch node for pending message
        }
      } else {
        // Handle tool calls
          const body = await fetchResponse.json();
          console.log(body);
          const finishReason = body.choices[0].finish_reason;
          console.log(finishReason);
          if (finishReason === 'tool_calls') {
          console.log("Processing tool call");
          const toolCalls = body.choices[0].message.tool_calls;
          
          const calltoolMessageContent = {
              role: "assistant",
              "tool_calls": toolCalls,
              content: '',
            };
          console.log(calltoolMessageContent);
          for (const toolCall of toolCalls) {
            if (toolCallCount >= 5) {
              console.error("Max tool calls reached. Stopping further tool calls.");
              return;
            }

            const toolParams = {
                id: toolCall.function.id || ' ',
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments || '{}'),
              };
            // Find the server config using the tool's full name
          const serverName = toolParams.name.split('.')[0];
          const serverConfig = serverConfigs.find(config => config.name === serverName);
        
          if (serverConfig?.promptForToolUse) {
            // Show the ToolCallApprovalDialog
            setShowToolCallApprovalDialog(true);
            setToolCallApprovalParams(toolParams);                           
         } else {
            // If Prompt for tool use is disabled, run the tool without user interaction
            try {
              const toolResponse = await mcpClient?.callTool(toolParams);
              const toolMessageContent = {
                tool_call_id: toolCall.function.id || ' ',
                role: "tool",
                name: toolCall.function.name,
                content: toolResponse.content[0].text,
              };

              if (toolResponse !== undefined) {
                const pendingMsg = {
                  ...pendingMessages[convId ?? ''],
                  content: JSON.stringify(toolMessageContent),
                };

                setPendingMessages((prev) => ({
                  ...prev,
                  [convId ?? '']: pendingMsg,
                }));

                // Send the tool response back to the LLM
                if (convId && viewingChat) {
                  const leafNodeId = viewingChat.messages.at(-1)?.id ?? null;
                  await sendMessage(convId, leafNodeId, JSON.stringify(toolMessageContent), [], () => {});
                }
              }
              } catch (error) {
                console.error(`Error calling tool: ${error}`);
                const pendingMsg = {
                  ...pendingMessages[convId ?? ''],
                  content: 'Tool failed to execute.',
                };

                setPendingMessages((prev) => ({
                  ...prev,
                  [convId ?? '']: pendingMsg,
                }));

                // Send the tool response back to the LLM
                if (convId && viewingChat) {
                  const leafNodeId = viewingChat.messages.at(-1)?.id ?? null;
                  await sendMessage(convId, leafNodeId, 'Tool failed to execute.', [], () => {});
                }
              }

              toolCallCount++;
            }
          }
        } else {
          //assume it wasn't a toolcall and post the message. 
          const newMessageContent = body.choices[0].message.content || '';
          console.log(newMessageContent)
          pendingMsg = {
        ...pendingMsg,
        content: newMessageContent,
      };
      setPending(convId, pendingMsg);
      }
      if (pendingMsg.content !== null) {
        await StorageUtils.appendMsg(pendingMsg as Message, leafNodeId);
      }
      setPending(convId, null);
      onChunk(pendingId); // Trigger scroll to bottom and switch to the last node
    }
    } catch (err) {
      setPending(convId, null);
      if ((err as Error).name === 'AbortError') {
        // user stopped the generation via stopGeneration() function
        // we can safely ignore this error
      } else {
        console.error(err);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alert((err as any)?.message ?? 'Unknown error');
        throw err; // rethrow
      }
    }
  };

  const sendMessage = async (
    convId: string | null,
    leafNodeId: Message['id'] | null,
    content: string,
    extra: Message['extra'],
    onChunk: CallbackGeneratedChunk
  ): Promise<boolean> => {
    if (isGenerating(convId ?? '') || content.trim().length === 0) return false;

    if (convId === null || convId.length === 0 || leafNodeId === null) {
      const conv = await StorageUtils.createConversation(
        content.substring(0, 256)
      );
      convId = conv.id;
      leafNodeId = conv.currNode;
      // if user is creating a new conversation, redirect to the new conversation
      navigate(`/chat/${convId}`);
    }

    const now = Date.now();
    const currMsgId = now;
    StorageUtils.appendMsg(
      {
        id: currMsgId,
        timestamp: now,
        type: 'text',
        convId,
        role: 'user',
        content,
        extra,
        parent: leafNodeId,
        children: [],
      },
      leafNodeId
    );
    onChunk(currMsgId);

    try {
      await generateMessage(convId, currMsgId, onChunk);
      return true;
    } catch (_) {
      // TODO: rollback
    }
    return false;
  };

  const stopGenerating = (convId: string) => {
    setPending(convId, null);
    aborts[convId]?.abort();
  };

  // if content is undefined, we remove last assistant message
  const replaceMessageAndGenerate = async (
    convId: string,
    parentNodeId: Message['id'], // the parent node of the message to be replaced
    content: string | null,
    extra: Message['extra'],
    onChunk: CallbackGeneratedChunk
  ) => {
    if (isGenerating(convId)) return;

    if (content !== null) {
      const now = Date.now();
      const currMsgId = now;
      StorageUtils.appendMsg(
        {
          id: currMsgId,
          timestamp: now,
          type: 'text',
          convId,
          role: 'user',
          content,
          extra,
          parent: parentNodeId,
          children: [],
        },
        parentNodeId
      );
      parentNodeId = currMsgId;
    }
    onChunk(parentNodeId);

    await generateMessage(convId, parentNodeId, onChunk);
  };

  const saveConfig = (config: typeof CONFIG_DEFAULT) => {
    StorageUtils.setConfig(config);
    setConfig(config);
  };

  return (
    <AppContext.Provider
      value={{
        isGenerating,
        viewingChat,
        pendingMessages,
        sendMessage,
        stopGenerating,
        replaceMessageAndGenerate,
        canvasData,
        setCanvasData,
        config,
        saveConfig,
        showSettings,
        setShowSettings,
        serverConfigs,
        setServerConfigs,
        mcpClient,
        setMcpClient,
        tools,
        setTools,
        prompts,
        setPrompts,
        resources,
        setResources,
        connectionStatus,
        setConnectionStatus,
        error,
        setError,
        additionalContext,
        setAdditionalContext,
        setShowToolCallApprovalDialog,
        setToolCallApprovalParams,
        showToolCallApprovalDialog,
        toolCallApprovalParams,
        handleToolCallApproval,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
