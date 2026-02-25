import type {
  ExtraHost,
  OidcConfig,
  PostgresConfig,
  RedisConfig,
  ResourceSpec,
  Volume,
  VolumeMount,
} from './services.js';

export interface BaseConfig {
  secrets: Record<string, Record<string, string>>;
  traefik: {
    install: boolean;
    globalArguments: string[];
    tlsStore: {
      default: {
        defaultCertificate: { secretName: string };
      };
    };
    logs: {
      general: { level: string };
      access: { enabled: boolean };
    };
  };
}

export interface PosixMapperConfig {
  skaha: { namespace: string };
  deployment: {
    hostname: string;
    posixMapper: {
      image: string;
      imagePullPolicy: string;
      resourceID: string;
      registryURL: string;
      gmsID: string;
      oidcURI: string;
      minUID: number;
      authorizedGroups: string[];
      authorizedClients: string[];
      resources: ResourceSpec;
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
    };
    extraHosts: ExtraHost[];
  };
  secrets: Record<string, Record<string, string>>;
  postgresql: PostgresConfig;
}

export interface SkahaConfig {
  kubernetesClusterDomain: string;
  replicaCount: number;
  deployment: {
    hostname: string;
    skaha: {
      registryHosts: string;
      skahaTld: string;
      imageCache: { refreshSchedule: string };
      usersGroup: string;
      adminsGroup: string;
      headlessGroup: string;
      headlessPriorityGroup: string;
      headlessPriorityClass: string;
      loggingGroups: string[];
      oidcURI: string;
      gmsID: string;
      posixMapperResourceID: string;
      registryURL: string;
      sessions: { maxCount: string; gpuEnabled: boolean };
      resources: ResourceSpec;
      extraEnv: Array<{ name: string; value: string }>;
      extraPorts: Array<{ containerPort: number; protocol: string }>;
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
      extraConfigData: Record<string, string>;
    };
    extraHosts: ExtraHost[];
  };
  secrets: Record<string, Record<string, string>>;
  storage: {
    service: {
      spec: {
        persistentVolumeClaim: { claimName: string };
      };
    };
  };
  redis: { networkPolicy: { enabled: boolean } };
}

export interface SciencePortalConfig {
  deployment: {
    hostname: string;
    sciencePortal: {
      image: string;
      imagePullPolicy: string;
      registryURL: string;
      skahaResourceID: string;
      gmsID: string;
      tabLabels: string[];
      resources: ResourceSpec;
      oidc: OidcConfig;
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
      themeName: string;
      storageXmlInfoUrl: string;
      sessions: { bannerText: string };
    };
    extraHosts: ExtraHost[];
  };
  secrets: Record<string, Record<string, string>>;
  redis: RedisConfig;
}

export interface CavernConfig {
  kubernetesClusterDomain: string;
  replicaCount: number;
  skaha: { namespace: string };
  deployment: {
    hostname: string;
    cavern: {
      image: string;
      imagePullPolicy: string;
      resourceID: string;
      registryURL: string;
      posixMapperResourceID: string;
      oidcURI: string;
      gmsID: string;
      identityManagerClass: string;
      securityContext: { fsGroup: number };
      filesystem: {
        dataDir: string;
        subPath: string;
        rootOwner: { username: string; uid: string; gid: string };
      };
      uws: {
        db: {
          install: boolean;
          runUID: number;
          database: string;
          username: string;
          password: string;
          schema: string;
          maxActive: number;
        };
      };
      applicationName: string;
      endpoint: string;
      resources: ResourceSpec;
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
    };
    extraHosts: ExtraHost[];
  };
  storage: {
    service: {
      spec: {
        persistentVolumeClaim: { claimName: string };
      };
    };
  };
  redis: RedisConfig;
}

export interface StorageUiConfig {
  deployment: {
    hostname: string;
    storageUI: {
      registryURL: string;
      oidc: OidcConfig;
      gmsID: string;
      themeName: string;
      backend: {
        defaultService: string;
        services: Record<
          string,
          {
            resourceID: string;
            nodeURIPrefix: string;
            userHomeDir: string;
            features: Record<string, boolean>;
          }
        >;
      };
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
      resources: ResourceSpec;
    };
    extraHosts: ExtraHost[];
  };
  redis: RedisConfig;
}

export interface DoiConfig {
  kubernetesClusterDomain: string;
  replicaCount: number;
  skaha: { namespace: string };
  deployment: {
    hostname: string;
    doi: {
      image: string;
      imagePullPolicy: string;
      resourceID: string;
      registryURL: string;
      gmsID: string;
      vospaceParentUri: string;
      metaDataPrefix: string;
      groupPrefix: string;
      landingUrl: string;
      datacite: {
        mdsUrl: string;
        accountPrefix: string;
        username: string;
        password: string;
      };
      doiIdentifierPrefix: string;
      publisherGroupURI: string;
      randomTestID: string;
      resources: ResourceSpec;
      extraVolumeMounts: VolumeMount[];
      extraVolumes: Volume[];
    };
    extraHosts: ExtraHost[];
  };
  secrets: Record<string, Record<string, string>>;
}

export type ServiceConfig =
  | BaseConfig
  | PosixMapperConfig
  | SkahaConfig
  | SciencePortalConfig
  | CavernConfig
  | StorageUiConfig
  | DoiConfig
  | Record<string, unknown>;
