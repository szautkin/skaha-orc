import { useMemo, useEffect } from 'react';
import type { ServiceId, DeploymentPhase, ServiceWithStatus } from '@skaha-orc/shared';
import { useServices, useService } from '@/hooks/use-services';
import { useServicePhaseStore } from '@/stores/service-phase-store';

export function useServicesLive() {
  const query = useServices();
  const overrides = useServicePhaseStore((s) => s.overrides);
  const reconcileAll = useServicePhaseStore((s) => s.reconcileAll);

  // Reconcile overrides whenever server data refreshes
  useEffect(() => {
    if (!query.data) return;
    const serverPhases = new Map<ServiceId, DeploymentPhase>();
    for (const svc of query.data) {
      serverPhases.set(svc.id, svc.status.phase);
    }
    reconcileAll(serverPhases);
  }, [query.data, reconcileAll]);

  // Merge overrides into services
  const data = useMemo(() => {
    if (!query.data) return query.data;
    if (overrides.size === 0) return query.data;

    return query.data.map((svc): ServiceWithStatus => {
      const override = overrides.get(svc.id);
      if (!override) return svc;
      return {
        ...svc,
        status: { ...svc.status, phase: override.phase },
      };
    });
  }, [query.data, overrides]);

  return { ...query, data };
}

export function useServiceLive(id: ServiceId) {
  const query = useService(id);
  const overrides = useServicePhaseStore((s) => s.overrides);
  const reconcile = useServicePhaseStore((s) => s.reconcile);

  // Reconcile on server data refresh
  useEffect(() => {
    if (!query.data) return;
    reconcile(id, query.data.status.phase);
  }, [query.data, reconcile, id]);

  // Merge override
  const data = useMemo(() => {
    if (!query.data) return query.data;
    const override = overrides.get(id);
    if (!override) return query.data;
    return {
      ...query.data,
      status: { ...query.data.status, phase: override.phase },
    };
  }, [query.data, overrides, id]);

  return { ...query, data };
}
