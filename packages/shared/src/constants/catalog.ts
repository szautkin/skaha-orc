import type { ServiceDefinition, ServiceId } from '../types/services.js';

export const SERVICE_CATALOG: Record<ServiceId, ServiceDefinition> = {
  base: {
    id: 'base',
    name: 'Base',
    description: 'Traefik ingress controller, TLS, and namespaces',
    namespace: 'default',
    dependencies: [],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'base' },
    valuesFile: 'base-values.yaml',
    optional: false,
  },
  reg: {
    id: 'reg',
    name: 'Registry',
    description: 'IVOA Registry service (nginx)',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: { type: 'local', path: '/Users/szautkin/reviews/helm_assets/reg' },
    valuesFile: null,
    optional: false,
  },
  volumes: {
    id: 'volumes',
    name: 'Volumes',
    description: 'PersistentVolume and PersistentVolumeClaim resources',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: { type: 'kubectl', path: 'volumes.yaml' },
    valuesFile: 'volumes.yaml',
    optional: false,
  },
  'posix-mapper-db': {
    id: 'posix-mapper-db',
    name: 'POSIX Mapper DB',
    description: 'Standalone PostgreSQL for posix-mapper',
    namespace: 'skaha-system',
    dependencies: ['volumes'],
    chartSource: { type: 'kubectl', path: 'posix-mapper-postgres.yaml' },
    valuesFile: 'posix-mapper-postgres.yaml',
    optional: false,
  },
  'posix-mapper': {
    id: 'posix-mapper',
    name: 'POSIX Mapper',
    description: 'UID/GID mapping service with PostgreSQL',
    namespace: 'skaha-system',
    dependencies: ['reg', 'posix-mapper-db'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'posixmapper' },
    valuesFile: 'posix-mapper-values.yaml',
    optional: false,
  },
  skaha: {
    id: 'skaha',
    name: 'Skaha',
    description: 'Session management service with Redis',
    namespace: 'skaha-system',
    dependencies: ['posix-mapper'],
    chartSource: { type: 'repo', repo: 'science-platform', chart: 'skaha' },
    valuesFile: 'skaha-values.yaml',
    optional: false,
  },
  cavern: {
    id: 'cavern',
    name: 'Cavern',
    description: 'VOSpace storage service with PostgreSQL UWS',
    namespace: 'skaha-system',
    dependencies: ['posix-mapper'],
    chartSource: {
      type: 'local',
      path: '/Users/szautkin/reviews/hfix/science-platform/deployment/helm/cavern',
    },
    valuesFile: 'cavern-values.yaml',
    optional: false,
  },
  'science-portal': {
    id: 'science-portal',
    name: 'Science Portal',
    description: 'Web UI for launching sessions (OIDC + Redis)',
    namespace: 'skaha-system',
    dependencies: ['skaha'],
    chartSource: {
      type: 'local',
      path: '/Users/szautkin/reviews/hfix/science-platform/deployment/helm/science-portal',
    },
    valuesFile: 'science-portal-values.yaml',
    optional: false,
  },
  'storage-ui': {
    id: 'storage-ui',
    name: 'Storage UI',
    description: 'Storage browser with OIDC and Redis',
    namespace: 'skaha-system',
    dependencies: ['cavern'],
    chartSource: { type: 'repo', repo: 'science-platform-client', chart: 'storageui' },
    valuesFile: 'storage.yaml',
    optional: false,
  },
  doi: {
    id: 'doi',
    name: 'DOI',
    description: 'DOI minting service (optional)',
    namespace: 'skaha-system',
    dependencies: ['cavern'],
    chartSource: {
      type: 'local',
      path: '/Users/szautkin/reviews/skaha-orc/charts/doi',
    },
    valuesFile: 'doi-values.yaml',
    optional: true,
  },
  'mock-ac': {
    id: 'mock-ac',
    name: 'Mock AC',
    description: 'Mock access-control service for development',
    namespace: 'skaha-system',
    dependencies: ['base'],
    chartSource: {
      type: 'local',
      path: '/Users/szautkin/reviews/skaha-orc/charts/mock-ac',
    },
    valuesFile: null,
    optional: true,
  },
};

/** Topological sort using Kahn's algorithm. Returns deploy order. */
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
