// ToolCallApprovalDialog.tsx
import React from 'react';
import { useAppContext } from '../utils/app.context';

interface ToolCallApprovalDialogProps {
  toolParams: any;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export const ToolCallApprovalDialog: React.FC<ToolCallApprovalDialogProps> = ({
  toolParams,
  onApprove,
  onDecline,
  onClose,
}) => {
  const { showToolCallApprovalDialog } = useAppContext();

  const handleApprove = async () => {
    await onApprove();
    onClose();
  };

  const handleDecline = () => {
    onDecline();
    onClose();
  };

  return (
    <dialog className={`modal ${showToolCallApprovalDialog ? 'modal-open' : ''}`}>
      <div className="modal-box w-11/12 max-w-3xl">
        <h3 className="text-lg font-bold mb-6">Tool Call Approval</h3>
        <div className="flex flex-col h-[calc(90vh-12rem)]">
          <p>Tool Name: {toolParams.name}</p>
          <p>Tool Description: {toolParams.description}</p>
          <p>Tool Arguments: {JSON.stringify(toolParams.arguments)}</p>
          <button className="btn btn-primary" onClick={handleApprove}>
            Approve
          </button>
          <button className="btn btn-secondary" onClick={handleDecline}>
            Decline
          </button>
        </div>
      </div>
    </dialog>
  );
};
