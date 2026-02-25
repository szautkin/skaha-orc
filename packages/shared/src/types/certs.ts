export interface CertInfo {
  secretName: string;
  keyName: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  isExpired: boolean;
  daysUntilExpiry: number;
}

export interface CaInfo {
  exists: boolean;
  subject?: string;
  issuer?: string;
  notAfter?: string;
  isExpired?: boolean;
  path: string;
}

export interface GenerateCertRequest {
  secretName: string;
  keyName: string;
  cn: string;
  days: number;
}

export interface GenerateCaRequest {
  cn: string;
  org: string;
  days: number;
}

export interface UploadCaRequest {
  certPem: string;
  keyPem: string;
}
