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
import { SERVICE_CATALOG, SERVICE_IDS } from '@skaha-orc/shared';
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
        },
      };
    });

    const edges: Edge[] = [];
    for (const id of SERVICE_IDS) {
      const def = SERVICE_CATALOG[id];
      for (const dep of def.dependencies) {
        edges.push({
          id: `${dep}-${id}`,
          source: dep,
          target: id,
          animated: statusMap.get(id)?.status.phase === 'deploying',
        });
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
    <div className="h-full w-full rounded-lg border border-gray-200 bg-white">
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
    </div>
  );
}
