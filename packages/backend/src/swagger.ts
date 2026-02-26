import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Skaha-Orc API',
      version: '0.1.0',
      description:
        'REST API for the Skaha-Orc deployment orchestrator. Manages Helm releases, Kubernetes resources, HAProxy routing, and TLS certificates for the OpenCADC science platform.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    components: {
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'string' },
          },
          required: ['success'],
        },
        PreflightCheck: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'warn', 'fail'] },
            message: { type: 'string' },
            remedy: { type: 'string' },
          },
        },
        PreflightResult: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: {
              type: 'array',
              items: { $ref: '#/components/schemas/PreflightCheck' },
            },
          },
        },
        DeploymentStatus: {
          type: 'object',
          properties: {
            serviceId: { type: 'string' },
            phase: {
              type: 'string',
              enum: [
                'not_installed', 'pending', 'deploying', 'deployed',
                'waiting_ready', 'healthy', 'paused', 'failed', 'uninstalling',
              ],
            },
            revision: { type: 'integer', nullable: true },
            lastDeployed: { type: 'string', nullable: true },
            helmStatus: { type: 'string', nullable: true },
            podCount: { type: 'integer' },
            readyPods: { type: 'integer' },
            error: { type: 'string', nullable: true },
          },
        },
        ServiceWithStatus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            namespace: { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } },
            valuesFile: { type: 'string', nullable: true },
            tier: { type: 'string', enum: ['core', 'recommended', 'site'] },
            status: { $ref: '#/components/schemas/DeploymentStatus' },
          },
        },
        OidcClientConfig: {
          type: 'object',
          properties: {
            clientID: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectURI: { type: 'string' },
            callbackURI: { type: 'string' },
            scope: { type: 'string' },
          },
        },
        PlatformOidcSettings: {
          type: 'object',
          required: ['issuerUri', 'sciencePortal', 'storageUi'],
          properties: {
            issuerUri: { type: 'string' },
            sciencePortal: { $ref: '#/components/schemas/OidcClientConfig' },
            storageUi: { $ref: '#/components/schemas/OidcClientConfig' },
          },
        },
        Pod: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            namespace: { type: 'string' },
            status: { type: 'string' },
            ready: { type: 'string' },
            restarts: { type: 'integer' },
            age: { type: 'string' },
            node: { type: 'string' },
          },
        },
        KubeEvent: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            reason: { type: 'string' },
            message: { type: 'string' },
            source: { type: 'string' },
            age: { type: 'string' },
            count: { type: 'integer' },
          },
        },
        CertInfo: {
          type: 'object',
          properties: {
            secretName: { type: 'string' },
            keyName: { type: 'string' },
            subject: { type: 'string' },
            issuer: { type: 'string' },
            notBefore: { type: 'string' },
            notAfter: { type: 'string' },
            isExpired: { type: 'boolean' },
            daysUntilExpiry: { type: 'integer' },
          },
        },
        CaInfo: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' },
            subject: { type: 'string' },
            issuer: { type: 'string' },
            notAfter: { type: 'string' },
            isExpired: { type: 'boolean' },
            path: { type: 'string' },
          },
        },
        GenerateCertRequest: {
          type: 'object',
          required: ['secretName', 'keyName', 'cn', 'days'],
          properties: {
            secretName: { type: 'string' },
            keyName: { type: 'string' },
            cn: { type: 'string', description: 'Common name (DNS name)' },
            days: { type: 'integer', minimum: 1, maximum: 10950 },
          },
        },
        GenerateCaRequest: {
          type: 'object',
          required: ['cn', 'org', 'days'],
          properties: {
            cn: { type: 'string', description: 'Common name (DNS name)' },
            org: { type: 'string', description: 'Organization name' },
            days: { type: 'integer', minimum: 1, maximum: 10950 },
          },
        },
        UploadCaRequest: {
          type: 'object',
          required: ['certPem', 'keyPem'],
          properties: {
            certPem: { type: 'string', description: 'PEM-encoded CA certificate' },
            keyPem: { type: 'string', description: 'PEM-encoded CA private key' },
          },
        },
        HAProxyDeployMode: {
          type: 'string',
          enum: ['kubernetes', 'docker', 'process'],
          description: 'How HAProxy is deployed',
        },
        DeployAllRequest: {
          type: 'object',
          required: ['serviceIds', 'dryRun'],
          properties: {
            serviceIds: { type: 'array', items: { type: 'string' } },
            dryRun: { type: 'boolean' },
          },
        },
        DeployAllProgress: {
          type: 'object',
          properties: {
            currentService: { type: 'string', nullable: true },
            completedServices: { type: 'array', items: { type: 'string' } },
            failedServices: { type: 'array', items: { type: 'string' } },
            pendingServices: { type: 'array', items: { type: 'string' } },
          },
        },
        ExtraHost: {
          type: 'object',
          properties: {
            ip: { type: 'string' },
            hostname: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [join(__dirname, 'routes', '*.ts'), join(__dirname, 'routes', '*.js')],
};

export const swaggerSpec = swaggerJsdoc(options);
