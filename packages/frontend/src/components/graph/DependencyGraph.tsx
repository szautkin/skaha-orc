import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useNavigate } from 'react-router-dom';
import type { ServiceWithStatus, ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, DEPLOY_PHASE_COLORS, DEPLOY_PHASE_LABELS, DEPLOY_PHASE_ORDER } from '@skaha-orc/shared';
import { ServiceNode } from './ServiceNode';

const nodeTypes = { serviceNode: ServiceNode };

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 140, height: 60 });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 70, y: pos.y - 30 },
    };
  });
}

interface DependencyGraphProps {
  services: ServiceWithStatus[];
}

export function DependencyGraph({ services }: DependencyGraphProps) {
  const navigate = useNavigate();
  const statusMap = useMemo(() => {
    const map = new Map<ServiceId, ServiceWithStatus>();
    for (const s of services) map.set(s.id, s);
    return map;
  }, [services]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = SERVICE_IDS.map((id) => {
      const def = SERVICE_CATALOG[id];
      const svc = statusMap.get(id);
      return {
        id,
        type: 'serviceNode',
        position: { x: 0, y: 0 },
        data: {
          label: def.name,
          phase: svc?.status.phase ?? 'not_installed',
          phaseColor: DEPLOY_PHASE_COLORS[def.deployPhase],
          deployPhase: def.deployPhase,
        },
      };
    });

    const edges: Edge[] = [];
    // Catalog dependencies (solid lines)
    for (const id of SERVICE_IDS) {
      const def = SERVICE_CATALOG[id];
      for (const dep of def.dependencies) {
        edges.push({
          id: `dep-${dep}-${id}`,
          source: dep,
          target: id,
          animated: statusMap.get(id)?.status.phase === 'deploying',
        });
      }
    }

    // Runtime dependencies (dashed lines)
    for (const id of SERVICE_IDS) {
      const def = SERVICE_CATALOG[id];
      for (const rd of def.runtimeDeps) {
        const depIds = Array.isArray(rd) ? rd : [rd];
        for (const depId of depIds) {
          // Skip if already a catalog dep
          if (def.dependencies.includes(depId)) continue;
          edges.push({
            id: `rt-${depId}-${id}`,
            source: depId,
            target: id,
            style: { strokeDasharray: '6 3', opacity: 0.4 },
            animated: false,
          });
        }
      }
    }

    const laid = layoutGraph(nodes, edges);
    return { initialNodes: laid, initialEdges: edges };
  }, [statusMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      navigate(node.id === 'haproxy' ? '/haproxy' : `/services/${node.id}`);
    },
    [navigate],
  );

  return (
    <div className="h-full w-full rounded-lg border border-gray-200 bg-white relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 border border-gray-200 rounded-md px-3 py-2 text-[10px] space-y-1.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {DEPLOY_PHASE_ORDER.map((p) => (
            <span key={p} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DEPLOY_PHASE_COLORS[p] }} />
              {p}. {DEPLOY_PHASE_LABELS[p]}
            </span>
          ))}
        </div>
        <div className="flex gap-3 text-neutral-gray">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t border-gray-500" /> catalog dep
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t border-dashed border-gray-400" /> runtime dep
          </span>
        </div>
      </div>
    </div>
  );
}
