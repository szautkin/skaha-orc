export const SERVICE_IDS = [
  'base',
  'reg',
  'volumes',
  'posix-mapper-db',
  'posix-mapper',
  'skaha',
  'cavern',
  'science-portal',
  'storage-ui',
  'doi',
  'mock-ac',
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export type ChartSource =
  | { type: 'repo'; repo: string; chart: string }
  | { type: 'local'; path: string }
  | { type: 'kubectl'; path: string };

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  description: string;
  namespace: string;
  dependencies: ServiceId[];
  chartSource: ChartSource;
  valuesFile: string | null;
  optional: boolean;
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
