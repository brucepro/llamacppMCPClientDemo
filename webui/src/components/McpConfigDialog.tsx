// McpConfigDialog.tsx
import React, { useEffect, useState } from 'react';
import { useAppContext } from '../utils/app.context';
import { McpServerConfig } from '../mcp/mcpSSEClient.ts';
import { classNames } from '../utils/misc';
import { OpenInNewTab, XCloseButton } from '../utils/common';
import StorageUtils from '../utils/storage';

export default function McpConfigDialog({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  const { serverConfigs, setServerConfigs } = useAppContext();
  const [localServerConfigs, setLocalServerConfigs] = useState<McpServerConfig[]>([]);


  useEffect(() => {
  // Load serverConfigs from local storage on initialization
  const savedConfigs = StorageUtils.getServerConfigs() ?? [];
  setLocalServerConfigs(savedConfigs);
  }, []);


  // Function to add a new server config
  const addServerConfig = () => {
    setLocalServerConfigs([...localServerConfigs, { name: '', type: 'sse', serverUrl: '' }]);
  };

  // Function to handle input changes
  const handleInputChange = (index: number, field: string, value: string) => {
    const newConfigs = [...localServerConfigs];
    newConfigs[index][field] = value;
    setLocalServerConfigs(newConfigs);
  };

  // Function to handle config save
  const handleSave = () => {
    StorageUtils.setServerConfigs(localServerConfigs);
    setServerConfigs(localServerConfigs);
    onClose();
  };

  // Function to delete a server config
  const deleteConfig = (index: number) => {
    const newConfigs = localServerConfigs.filter((_, i) => i !== index);
    setLocalServerConfigs(newConfigs);
  };

  return (
    <dialog className={classNames({ modal: true, 'modal-open': show })}>
      <div className="modal-box w-11/12 max-w-3xl">
        <h3 className="text-lg font-bold mb-6">MCP Configurations</h3>
        <div className="flex flex-col h-[calc(90vh-12rem)]">
          {localServerConfigs.map((config, index) => (
            <div key={index} className="flex flex-row items-center gap-2 mx-4 mb-2">
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
                <XCloseButton />
              </button>
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
}

