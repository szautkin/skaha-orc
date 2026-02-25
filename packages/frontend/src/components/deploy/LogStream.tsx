import { useRef, useEffect } from 'react';
import type { DeploymentEvent } from '@skaha-orc/shared';

interface LogStreamProps {
  events: DeploymentEvent[];
}

export function LogStream({ events }: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div
      ref={containerRef}
      className="bg-gray-900 text-gray-100 font-mono text-xs p-4 rounded-md h-full min-h-[400px] overflow-auto"
    >
      {events.length === 0 ? (
        <p className="text-neutral-gray">Waiting for deployment events...</p>
      ) : (
        events.map((event, i) => {
          const color =
            event.type === 'error'
              ? 'text-red-400'
              : event.type === 'phase_change'
                ? 'text-buttercup-yellow'
                : event.type === 'complete'
                  ? 'text-emerald-400'
                  : 'text-gray-300';

          return (
            <div key={i} className={`leading-5 ${color}`}>
              <span className="text-neutral-gray mr-2 select-none">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-blue-400 mr-2">[{event.serviceId}]</span>
              <span>{event.message}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
