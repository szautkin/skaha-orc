import { useRef, useEffect } from 'react';
import { usePodLogs } from '@/hooks/use-pods';

interface PodLogViewerProps {
  serviceId: string;
  podName: string | null;
}

export function PodLogViewer({ serviceId, podName }: PodLogViewerProps) {
  const { logs } = usePodLogs(serviceId, podName);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!podName) {
    return (
      <div className="text-sm text-neutral-gray text-center py-8">
        Select a pod to view logs.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-gray-900 text-gray-100 font-mono text-xs p-4 rounded-md h-80 overflow-auto"
    >
      {logs.length === 0 ? (
        <p className="text-neutral-gray">Waiting for logs...</p>
      ) : (
        logs.map((entry, i) => (
          <div key={i} className="leading-5">
            <span className="text-neutral-gray mr-2 select-none">{entry.timestamp}</span>
            <span>{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
