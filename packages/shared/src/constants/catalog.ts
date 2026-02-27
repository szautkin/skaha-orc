import type { ServiceDefinition, ServiceId, ServiceTier } from '../types/services.js';
import type { DeploymentPhase } from '../types/deployment.js';

export const PLATFORM_HOSTNAME = 'haproxy.cadc.dao.nrc.ca';

export const TIER_ORDER: ServiceTier[] = ['core', 'recommended', 'site'];

export const TIER_LABELS: Record<ServiceTier, string> = {
  core: 'Core Infrastructure',
  recommended: 'Recommended Services',
  site: 'Site-Specific',
};

export const SERVICE_CATALOG: Record<ServiceId, ServiceDefinition> = {
  base: {
    id: 'base',
    name: 'Base',
    description: 'Traefik ingress controller, TLS, and namespaces',
    namespace: 'default',
    dependencies: [],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'base' },
    valuesFile: 'base-values.yaml',
    tier: 'core',
    endpointPath: null,
    k8sServiceName: null,
    k8sServicePort: null,
  },
  haproxy: {
    id: 'haproxy',
    name: 'HAProxy',
    description: 'Reverse proxy and load balancer',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: { type: 'haproxy' },
    valuesFile: null,
    tier: 'site',
    endpointPath: null,
    k8sServiceName: 'haproxy',
    k8sServicePort: 443,
  },
  reg: {
    id: 'reg',
    name: 'Registry',
    description: 'IVOA Registry service',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: { type: 'local', path: 'reg' },
    valuesFile: 'reg-values.yaml',
    tier: 'core',
    endpointPath: '/reg',
    k8sServiceName: 'reg',
    k8sServicePort: 8080,
  },
  volumes: {
    id: 'volumes',
    name: 'Volumes',
    description: 'PersistentVolume and PersistentVolumeClaim resources',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: { type: 'kubectl', path: 'volumes.yaml' },
    valuesFile: 'volumes.yaml',
    tier: 'core',
    endpointPath: null,
    k8sServiceName: null,
    k8sServicePort: null,
  },
  'posix-mapper-db': {
    id: 'posix-mapper-db',
    name: 'POSIX Mapper DB',
    description: 'Standalone PostgreSQL for posix-mapper',
    namespace: 'skaha-system',
    dependencies: ['volumes'],
    chartSource: { type: 'kubectl', path: 'posix-mapper-postgres.yaml' },
    valuesFile: 'posix-mapper-postgres.yaml',
    tier: 'core',
    endpointPath: null,
    k8sServiceName: 'posix-mapper-postgres',
    k8sServicePort: 5432,
  },
  'posix-mapper': {
    id: 'posix-mapper',
    name: 'POSIX Mapper',
    description: 'UID/GID mapping service with PostgreSQL',
    namespace: 'skaha-system',
    dependencies: ['reg', 'posix-mapper-db'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'posixmapper' },
    valuesFile: 'posix-mapper-values.yaml',
    tier: 'core',
    endpointPath: '/posix-mapper',
    k8sServiceName: 'posix-mapper-tomcat-svc',
    k8sServicePort: 8080,
  },
  skaha: {
    id: 'skaha',
    name: 'Skaha',
    description: 'Session management service with Redis',
    namespace: 'skaha-system',
    dependencies: ['cavern'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'skaha' },
    valuesFile: 'skaha-values.yaml',
    tier: 'core',
    endpointPath: '/skaha',
    k8sServiceName: 'skaha-tomcat-svc',
    k8sServicePort: 8080,
  },
  cavern: {
    id: 'cavern',
    name: 'Cavern',
    description: 'VOSpace storage service with PostgreSQL UWS',
    namespace: 'skaha-system',
    dependencies: ['posix-mapper'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'cavern' },
    valuesFile: 'cavern-values.yaml',
    tier: 'core',
    endpointPath: '/cavern',
    k8sServiceName: 'cavern-tomcat-svc',
    k8sServicePort: 8080,
  },
  'science-portal': {
    id: 'science-portal',
    name: 'Science Portal',
    description: 'Web UI for launching sessions (OIDC + Redis)',
    namespace: 'skaha-system',
    dependencies: ['skaha'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'scienceportal' },
    valuesFile: 'science-portal-values.yaml',
    tier: 'recommended',
    endpointPath: '/science-portal',
    k8sServiceName: 'science-portal-tomcat-svc',
    k8sServicePort: 8080,
  },
  'storage-ui': {
    id: 'storage-ui',
    name: 'Storage UI',
    description: 'Storage browser with OIDC and Redis',
    namespace: 'skaha-system',
    dependencies: ['cavern'],
    chartSource: { type: 'repo', repo: 'science-platform-client', chart: 'storageui' },
    valuesFile: 'storage.yaml',
    tier: 'recommended',
    endpointPath: '/storage',
    k8sServiceName: 'storage-ui-tomcat-svc',
    k8sServicePort: 8080,
  },
  doi: {
    id: 'doi',
    name: 'DOI',
    description: 'DOI minting service',
    namespace: 'skaha-system',
    dependencies: ['cavern'],
    chartSource: {
      type: 'local',
      path: 'doi',
    },
    valuesFile: 'doi-values.yaml',
    tier: 'site',
    endpointPath: '/doi',
    k8sServiceName: 'doi-tomcat',
    k8sServicePort: 80,
  },
  dex: {
    id: 'dex',
    name: 'Dex',
    description: 'Lightweight OIDC provider with static passwords (dev/demo)',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: {
      type: 'local',
      path: 'dex',
    },
    valuesFile: 'dex-values.yaml',
    tier: 'site',
    endpointPath: '/dex',
    k8sServiceName: 'dex',
    k8sServicePort: 5556,
  },
  keycloak: {
    id: 'keycloak',
    name: 'Keycloak',
    description: 'Full-featured OIDC identity provider with admin console',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: {
      type: 'repo',
      repo: 'bitnami',
      chart: 'keycloak',
    },
    valuesFile: 'keycloak-values.yaml',
    tier: 'site',
    endpointPath: '/auth',
    k8sServiceName: 'keycloak',
    k8sServicePort: 8080,
  },
};

export type DeploymentProfileId = 'standard' | 'production' | 'minimal' | 'full';

export interface DeploymentProfile {
  id: DeploymentProfileId;
  name: string;
  description: string;
  serviceIds: ServiceId[];
}

const coreAndRecommended = Object.values(SERVICE_CATALOG)
  .filter((s) => s.tier === 'core' || s.tier === 'recommended')
  .map((s) => s.id);

export const DEPLOYMENT_PROFILES: DeploymentProfile[] = [
  {
    id: 'standard',
    name: 'Dev / Demo',
    description: 'Core + recommended + HAProxy + Dex (static passwords, zero setup)',
    serviceIds: [...coreAndRecommended, 'haproxy', 'dex'] as ServiceId[],
  },
  {
    id: 'production',
    name: 'Production',
    description: 'Core + recommended + HAProxy + Keycloak (full IdP with admin console)',
    serviceIds: [...coreAndRecommended, 'haproxy', 'keycloak'] as ServiceId[],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Core infrastructure only',
    serviceIds: Object.values(SERVICE_CATALOG)
      .filter((s) => s.tier === 'core')
      .map((s) => s.id) as ServiceId[],
  },
  {
    id: 'full',
    name: 'Full',
    description: 'All services (includes both Dex and Keycloak)',
    serviceIds: [...Object.keys(SERVICE_CATALOG)] as ServiceId[],
  },
];

/**
 * Groups all services from the catalog by their tier (core, recommended, site).
 * Each service appears in exactly one tier.
 */
export function getServicesByTier(): Record<ServiceTier, ServiceId[]> {
  const result: Record<ServiceTier, ServiceId[]> = {
    core: [],
    recommended: [],
    site: [],
  };

  for (const def of Object.values(SERVICE_CATALOG)) {
    result[def.tier].push(def.id);
  }

  return result;
}

/**
 * Returns services in valid deployment order using topological sort (Kahn's algorithm).
 * Respects dependency edges so each service is deployed after its prerequisites.
 * @param selectedIds - Subset of services to order. Defaults to all services.
 * @returns ServiceId array in deployment order.
 * @throws If a dependency cycle is detected.
 */
export function getDeploymentOrder(
  selectedIds?: ServiceId[],
): ServiceId[] {
  const ids = selectedIds ?? (Object.keys(SERVICE_CATALOG) as ServiceId[]);
  const selected = new Set(ids);

  const inDegree = new Map<ServiceId, number>();
  const adjacency = new Map<ServiceId, ServiceId[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const id of ids) {
    const service = SERVICE_CATALOG[id];
    for (const dep of service.dependencies) {
      if (selected.has(dep)) {
        adjacency.get(dep)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  const queue: ServiceId[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: ServiceId[] = [];
  while (queue.length > 0) {
    queue.sort(); // deterministic ordering
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (order.length !== ids.length) {
    throw new Error('Cycle detected in service dependency graph');
  }

  return order;
}

const RUNNING_PHASES: ReadonlySet<DeploymentPhase> = new Set([
  'deployed',
  'healthy',
  'waiting_ready',
]);

/**
 * Returns the list of dependencies for `serviceId` that are NOT in a running
 * phase according to `phaseMap`.  An empty array means all deps are satisfied.
 */
export function getUnmetDependencies(
  serviceId: ServiceId,
  phaseMap: ReadonlyMap<ServiceId, DeploymentPhase>,
): { id: ServiceId; name: string }[] {
  const def = SERVICE_CATALOG[serviceId];
  if (!def) return [];

  return def.dependencies
    .filter((depId) => {
      const phase = phaseMap.get(depId);
      return !phase || !RUNNING_PHASES.has(phase);
    })
    .map((depId) => ({ id: depId, name: SERVICE_CATALOG[depId].name }));
}
