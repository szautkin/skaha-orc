// Types
export type {
  ServiceId,
  ServiceDefinition,
  ChartSource,
  ResourceSpec,
  OidcConfig,
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
  ApiResponse,
  ServiceWithStatus,
  ServiceDetailResponse,
  ServiceListResponse,
  PodsResponse,
  EventsResponse,
  DeployRequest,
  ConfigUpdateRequest,
} from './types/api.js';

// Constants
export { SERVICE_CATALOG, getDeploymentOrder } from './constants/catalog.js';
export { UVIC_COLORS, PHASE_COLORS, PHASE_LABELS } from './constants/colors.js';

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
} from './validation/schemas.js';
