// ConfigComponent.tsx
import React, { useState } from 'react';

interface ConfigComponentProps {
  serverConfigs: McpServerConfig[];
  onConfigSave: (newConfigs: McpServerConfig[]) => void;
  onDeleteServer: (index: number) => void;
}

const ConfigComponent: React.FC<ConfigComponentProps> = ({ serverConfigs, onConfigSave, onDeleteServer }) => {
  const [configs, setConfigs] = useState<McpServerConfig[]>(serverConfigs);

  const handleInputChange = (index: number, field: string, value: string) => {
    const newConfigs = [...configs];
    newConfigs[index][field] = value;
    setConfigs(newConfigs);
  };

  const addServerConfig = () => {
    setConfigs([...configs, { name: '', type: 'sse', serverUrl: '' }]);
  };

  const saveConfig = () => {
    onConfigSave(configs);
  };

  const deleteConfig = (index: number) => {
    onDeleteServer(index);
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <h2>Configure MCP Servers</h2>
      {configs.map((config, index) => (
        <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Server Name"
            value={config.name}
            onChange={(e) => handleInputChange(index, 'name', e.target.value)}
            style={{ width: '200px', padding: '5px', marginRight: '5px' }}
          />
          <input
            type="text"
            placeholder="Server URL"
            value={config.serverUrl}
            onChange={(e) => handleInputChange(index, 'serverUrl', e.target.value)}
            style={{ width: '300px', padding: '5px', marginRight: '5px' }}
          />
          <button onClick={() => deleteConfig(index)} style={{ padding: '5px 10px', backgroundColor: 'red', color: 'white', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      ))}
      <button onClick={addServerConfig} style={{ padding: '5px 10px', marginRight: '5px', cursor: 'pointer' }}>Add Server</button>
      <button onClick={saveConfig} style={{ padding: '5px 10px', cursor: 'pointer' }}>Save Config</button>
    </div>
  );
};

export default ConfigComponent;
