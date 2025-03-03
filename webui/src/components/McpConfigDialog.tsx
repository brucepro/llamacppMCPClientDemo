// McpConfigDialog.tsx
import { useState } from 'react';
import { useAppContext } from '../utils/app.context';
import { McpServerConfig  } from '../mcp/mcpSSEClient.ts';

interface McpConfigDialogProps {
  show: boolean;
  onClose: () => void;
}

export const McpConfigDialog: React.FC<McpConfigDialogProps> = ({
  show,
  onClose,
}) => {
  const { serverConfigs, setServerConfigs } = useAppContext();

  const [localServerConfigs, setLocalServerConfigs] = useState<McpServerConfig[]>(serverConfigs);

  const handleInputChange = (index: number, field: keyof McpServerConfig, value: string) => {
    const newConfigs = [...localServerConfigs];
    if (field === 'promptForToolUse') {
      newConfigs[index][field] = value === 'true';
    } else if (field === 'maxToolCalls') {
      newConfigs[index][field] = Number(value);
    } else {
      newConfigs[index][field] = value;
    }
    setLocalServerConfigs(newConfigs);
  };

  const handleSave = () => {
    setServerConfigs(localServerConfigs);
    onClose();
  };

  const addServerConfig = () => {
    setLocalServerConfigs([...localServerConfigs, { name: '', type: 'sse', serverUrl: '', connectionStatus: 'Disconnected', maxToolCalls: 5, promptForToolUse: true }]);
  };

  const deleteConfig = (index: number) => {
    const newConfigs = localServerConfigs.filter((_, i) => i !== index);
    setLocalServerConfigs(newConfigs);
  };

  return (
    <dialog className={`modal ${show ? 'modal-open' : ''}`}>
      <div className="modal-box w-11/12 max-w-3xl">
        <h3 className="text-lg font-bold mb-6">MCP Configurations</h3>
        <div className="flex flex-col h-[calc(90vh-12rem)]">
          {localServerConfigs.map((config, index) => (
            <div key={index} className="border border-base-300 rounded-lg p-4 mb-4">
              <div className="flex flex-row items-center gap-2 mx-4 mb-2">
                <input
                  type="text"
                  placeholder="Server Name"
                  value={config.name}
                  onChange={(e) => handleInputChange(index, 'name', e.target.value)}
                  className="input input-bordered w-full"
                />
                <input
                  type="text"
                  placeholder="Server URL"
                  value={config.serverUrl}
                  onChange={(e) => handleInputChange(index, 'serverUrl', e.target.value)}
                  className="input input-bordered w-full"
                />
                <button className="btn btn-sm btn-ghost p-1" onClick={() => deleteConfig(index)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8l-2.647-2.646a.5.5 0 0 1 .708-.708L8 7.293z"/>
                  </svg>
                </button>
              </div>
              <div className="flex flex-row items-center gap-2 mx-4 mb-2">
                <input
                  type="checkbox"
                  className="toggle"
                  checked={config.promptForToolUse}
                  onChange={(e) => handleInputChange(index, 'promptForToolUse', e.target.checked.toString())}
                />
                <span>Prompt for Tool Use</span>
              </div>
              <div className="flex flex-row items-center gap-2 mx-4 mb-2">
                <input
                  type="number"
                  className="input input-bordered w-full"
                  value={config.maxToolCalls}
                  onChange={(e) => handleInputChange(index, 'maxToolCalls', e.target.value)}
                  placeholder="Max Tool Calls"
                />
              </div>
            </div>
          ))}
          <button className="btn btn-primary mb-6" onClick={addServerConfig}>
            Add Server
          </button>
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </dialog>
  );
};
