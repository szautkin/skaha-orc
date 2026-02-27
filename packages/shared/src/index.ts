// Types
export type {
  ServiceId,
  ServiceDefinition,
  ServiceTier,
  DeployPhaseNumber,
  RuntimeDep,
  ChartSource,
  ResourceSpec,
  OidcConfig,
  OidcClientConfig,
  PlatformOidcSettings,
  ReadinessLevel,
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
  TlsMode,
  ServiceTrustStatus,
  TlsStatus,
  ApplyTrustResult,
} from './types/tls.js';

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
  DEPLOY_PHASE_LABELS,
  DEPLOY_PHASE_ORDER,
  DEPLOYMENT_PROFILES,
  getServicesByTier,
  getServicesByPhase,
  getDeploymentOrder,
  getUnmetDependencies,
  getRuntimeWarnings,
} from './constants/catalog.js';
export type { DeploymentProfileId, DeploymentProfile } from './constants/catalog.js';

export { UVIC_COLORS, PHASE_COLORS, PHASE_LABELS, TIER_COLORS, DEPLOY_PHASE_COLORS, DEPLOY_PHASE_BG } from './constants/colors.js';

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
