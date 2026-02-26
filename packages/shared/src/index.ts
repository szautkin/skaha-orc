// Types
export type {
  ServiceId,
  ServiceDefinition,
  ServiceTier,
  ChartSource,
  ResourceSpec,
  OidcConfig,
  OidcClientConfig,
  PlatformOidcSettings,
  PostgresConfig,
  RedisConfig,
  ExtraHost,
  VolumeMount,
  Volume,
} from './types/services.js';
export { SERVICE_IDS } from './types/services.js';

export type {
  BaseConfig,
  PosixMapperConfig,
  SkahaConfig,
  SciencePortalConfig,
  CavernConfig,
  StorageUiConfig,
  DoiConfig,
  DexConfig,
  KeycloakConfig,
  ServiceConfig,
} from './types/configs.js';

export type {
  DeploymentPhase,
  DeploymentStatus,
  DeploymentEvent,
  DeployAllRequest,
  DeployAllProgress,
} from './types/deployment.js';

export type { Pod, KubeEvent, LogLine } from './types/kubernetes.js';

export type {
  CertInfo,
  CaInfo,
  GenerateCertRequest,
  GenerateCaRequest,
  UploadCaRequest,
} from './types/certs.js';

export type {
  HAProxyDeployMode,
  HAProxyStatus,
  HAProxyConfigResponse,
  HAProxySaveConfigRequest,
  HAProxyTestConfigResponse,
  HAProxyDeployRequest,
  HAProxyPrereqCheck,
  HAProxyPreflightResponse,
  HAProxyCertInfo,
} from './types/haproxy.js';

export type {
  ApiResponse,
  ServiceWithStatus,
  ServiceDetailResponse,
  ServiceListResponse,
  PodsResponse,
  EventsResponse,
  DeployRequest,
  ConfigUpdateRequest,
  PreflightCheck,
  PreflightResult,
} from './types/api.js';

// Constants
export {
  SERVICE_CATALOG,
  PLATFORM_HOSTNAME,
  TIER_ORDER,
  TIER_LABELS,
  DEPLOYMENT_PROFILES,
  getServicesByTier,
  getDeploymentOrder,
} from './constants/catalog.js';
export type { DeploymentProfileId, DeploymentProfile } from './constants/catalog.js';

export { UVIC_COLORS, PHASE_COLORS, PHASE_LABELS, TIER_COLORS } from './constants/colors.js';

// Validation
export {
  resourceSpecSchema,
  oidcConfigSchema,
  extraHostSchema,
  volumeMountSchema,
  volumeSchema,
  redisConfigSchema,
  postgresConfigSchema,
  deployRequestSchema,
  deployAllRequestSchema,
  configUpdateSchema,
  platformOidcSettingsSchema,
} from './validation/schemas.js';
