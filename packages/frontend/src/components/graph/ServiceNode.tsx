import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DeploymentPhase } from '@skaha-orc/shared';
import { PHASE_COLORS } from '@skaha-orc/shared';

interface ServiceNodeData {
  label: string;
  phase: DeploymentPhase;
  tierColor?: string;
  [key: string]: unknown;
}

function ServiceNodeComponent({ data }: NodeProps) {
  const nodeData = data as ServiceNodeData;
  const borderColor = PHASE_COLORS[nodeData.phase];

  return (
    <div
      className="bg-white rounded-lg shadow-sm px-4 py-2 border-2 min-w-[120px] text-center"
      style={{ borderColor, borderLeftColor: nodeData.tierColor ?? borderColor, borderLeftWidth: 4 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-gray !w-2 !h-2" />
      <p className="text-sm font-medium">{nodeData.label}</p>
      <p
        className="text-[10px] font-medium mt-0.5 uppercase tracking-wider"
        style={{ color: borderColor }}
      >
        {nodeData.phase.replace('_', ' ')}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-gray !w-2 !h-2" />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);
