import { create } from 'zustand';
import type { ServiceId, DeploymentPhase } from '@skaha-orc/shared';

interface PhaseOverride {
  phase: DeploymentPhase;
  timestamp: number;
}

const STALE_MS = 30_000;

interface ServicePhaseState {
  overrides: Map<ServiceId, PhaseOverride>;

  setOptimistic: (id: ServiceId, phase: DeploymentPhase) => void;
  setBulkOptimistic: (ids: ServiceId[], phase: DeploymentPhase) => void;
  clearOverride: (id: ServiceId) => void;
  clearAll: () => void;

  reconcile: (id: ServiceId, serverPhase: DeploymentPhase) => void;
  reconcileAll: (serverPhases: Map<ServiceId, DeploymentPhase>) => void;

  getPhase: (id: ServiceId, serverPhase: DeploymentPhase) => DeploymentPhase;
}

const TERMINAL_PHASES: ReadonlySet<DeploymentPhase> = new Set([
  'deployed',
  'paused',
  'failed',
  'not_installed',
]);

function shouldClear(override: PhaseOverride, serverPhase: DeploymentPhase): boolean {
  if (override.phase === serverPhase) return true;
  if (TERMINAL_PHASES.has(serverPhase) && Date.now() - override.timestamp > 5_000) return true;
  if (Date.now() - override.timestamp > STALE_MS) return true;
  return false;
}

export const useServicePhaseStore = create<ServicePhaseState>((set, get) => ({
  overrides: new Map(),

  setOptimistic: (id, phase) =>
    set((state) => {
      const next = new Map(state.overrides);
      next.set(id, { phase, timestamp: Date.now() });
      return { overrides: next };
    }),

  setBulkOptimistic: (ids, phase) =>
    set((state) => {
      const next = new Map(state.overrides);
      const now = Date.now();
      for (const id of ids) {
        next.set(id, { phase, timestamp: now });
      }
      return { overrides: next };
    }),

  clearOverride: (id) =>
    set((state) => {
      const next = new Map(state.overrides);
      next.delete(id);
      return { overrides: next };
    }),

  clearAll: () => set({ overrides: new Map() }),

  reconcile: (id, serverPhase) => {
    const override = get().overrides.get(id);
    if (override && shouldClear(override, serverPhase)) {
      get().clearOverride(id);
    }
  },

  reconcileAll: (serverPhases) =>
    set((state) => {
      const { overrides } = state;
      if (overrides.size === 0) return state;

      let changed = false;
      const next = new Map(overrides);
      for (const [id, override] of next) {
        const serverPhase = serverPhases.get(id);
        if (serverPhase && shouldClear(override, serverPhase)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? { overrides: next } : state;
    }),

  getPhase: (id, serverPhase) => {
    const override = get().overrides.get(id);
    return override ? override.phase : serverPhase;
  },
}));
