export type ServiceTier = 'core' | 'recommended' | 'site';

export type DeployPhaseNumber = 1 | 2 | 3 | 4;

/** A single service ID, or an array of alternatives where any one satisfies the dep. */
export type RuntimeDep = ServiceId | ServiceId[];

export const SERVICE_IDS = [
  'base',
  'haproxy',
  'reg',
  'volumes',
  'posix-mapper-db',
  'posix-mapper',
  'mock-ac',
  'skaha',
  'cavern',
  'science-portal',
  'storage-ui',
  'doi',
  'dex',
  'keycloak',
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export type ChartSource =
  | { type: 'repo'; repo: string; chart: string }
  | { type: 'local'; path: string }
  | { type: 'kubectl'; path: string }
  | { type: 'haproxy' };

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  description: string;
  namespace: string;
  dependencies: ServiceId[];
  runtimeDeps: RuntimeDep[];
  deployPhase: DeployPhaseNumber;
  chartSource: ChartSource;
  valuesFile: string | null;
  tier: ServiceTier;
  endpointPath: string | null;
  k8sServiceName: string | null;
  k8sServicePort: number | null;
}

export interface ResourceSpec {
  requests: { memory: string; cpu: string };
  limits: { memory: string; cpu: string };
}

export interface OidcConfig {
  uri: string;
  clientID: string;
  clientSecret: string;
  callbackURI: string;
  redirectURI: string;
  scope: string;
}

export interface PostgresConfig {
  maxActive: number;
  url: string;
  schema: string;
  auth: {
    username: string;
    password: string;
  };
}

export interface RedisConfig {
  image: { repository: string; tag: string };
  architecture: string;
  auth: { enabled: boolean };
  master: { persistence: { enabled: boolean } };
}

export interface ExtraHost {
  ip: string;
  hostname: string;
}

export interface VolumeMount {
  mountPath: string;
  name: string;
}

export interface Volume {
  name: string;
  secret?: { defaultMode: number; secretName: string };
}

export interface OidcClientConfig {
  clientID: string;
  clientSecret: string;
  redirectURI: string;
  callbackURI: string;
  scope: string;
}

export interface PlatformOidcSettings {
  issuerUri: string;
  sciencePortal: OidcClientConfig;
  storageUi: OidcClientConfig;
  skaha: OidcClientConfig;
}

export type ReadinessLevel = 'healthy' | 'deployed' | 'warnings' | 'blocked' | 'idle' | 'testing' | 'failed';
