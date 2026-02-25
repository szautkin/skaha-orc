import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { api, createSSEStream } from '@/lib/api';

export function usePods(serviceId: string) {
  return useQuery({
    queryKey: ['services', serviceId, 'pods'],
    queryFn: () => api.getPods(serviceId),
    refetchInterval: 15_000,
  });
}

interface LogEntry {
  message: string;
  timestamp: string;
}

export function usePodLogs(serviceId: string, podName: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startStream = useCallback(() => {
    if (!podName) return;

    setLogs([]);
    cleanupRef.current?.();

    cleanupRef.current = createSSEStream(`/services/${serviceId}/logs/${podName}`, (data) => {
      const entry = data as LogEntry;
      setLogs((prev) => [...prev, entry]);
    });
  }, [serviceId, podName]);

  const stopStream = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => {
    startStream();
    return () => {
      cleanupRef.current?.();
    };
  }, [startStream]);

  return { logs, stopStream };
}
