export type TlsMode = 'self-signed' | 'lets-encrypt' | 'not-configured';

export interface ServiceTrustStatus {
  serviceId: string;
  serviceName: string;
  deploymentName: string;
  hasCaCert: boolean;
}

export interface TlsStatus {
  mode: TlsMode;
  ca: { exists: boolean; subject?: string; issuer?: string; isSelfSigned?: boolean };
  haproxyCert: { exists: boolean; issuer?: string; isSelfSigned?: boolean };
  services: ServiceTrustStatus[];
}

export interface ApplyTrustResult {
  servicesPatched: string[];
  errors: Array<{ serviceId: string; error: string }>;
}
