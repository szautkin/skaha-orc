import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { DeploymentEvent } from '@skaha-orc/shared';
import { api, createSSEStream } from '@/lib/api';
import { useServicePhaseStore } from '@/stores/service-phase-store';

export function useDeployAll() {
  const [events, setEvents] = useState<DeploymentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startStream = useCallback(() => {
    setEvents([]);
    setIsStreaming(true);

    cleanupRef.current = createSSEStream('/deploy-all/stream', (data) => {
      const event = data as DeploymentEvent;
      setEvents((prev) => [...prev, event]);

      if (event.type === 'phase_change' && event.phase) {
        useServicePhaseStore.getState().setOptimistic(event.serviceId, event.phase);
      }

      if (event.type === 'complete') {
        setIsStreaming(false);
        cleanupRef.current?.();
        cleanupRef.current = null;
      }
    });
  }, []);

  const stopStream = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const mutation = useMutation({
    mutationFn: ({ serviceIds, dryRun }: { serviceIds: string[]; dryRun: boolean }) => {
      startStream();
      return api.deployAll(serviceIds, dryRun);
    },
  });

  return { ...mutation, events, isStreaming, stopStream };
}
