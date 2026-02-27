import { z } from 'zod';

export const resourceSpecSchema = z.object({
  requests: z.object({ memory: z.string(), cpu: z.string() }),
  limits: z.object({ memory: z.string(), cpu: z.string() }),
});

export const oidcConfigSchema = z.object({
  uri: z.string().url(),
  clientID: z.string().min(1),
  clientSecret: z.string().min(1),
  callbackURI: z.string().url(),
  redirectURI: z.string().url(),
  scope: z.string().min(1),
});

export const extraHostSchema = z.object({
  ip: z.string().min(1),
  hostname: z.string().min(1),
});

export const volumeMountSchema = z.object({
  mountPath: z.string().min(1),
  name: z.string().min(1),
});

export const volumeSchema = z.object({
  name: z.string().min(1),
  secret: z
    .object({
      defaultMode: z.number(),
      secretName: z.string().min(1),
    })
    .optional(),
});

export const redisConfigSchema = z.object({
  image: z.object({ repository: z.string(), tag: z.string() }),
  architecture: z.string(),
  auth: z.object({ enabled: z.boolean() }),
  master: z.object({ persistence: z.object({ enabled: z.boolean() }) }),
});

export const postgresConfigSchema = z.object({
  install: z.boolean(),
  image: z.string(),
  maxActive: z.number(),
  auth: z.object({
    username: z.string(),
    password: z.string(),
    database: z.string(),
    schema: z.string(),
  }),
  storage: z.object({
    spec: z.record(z.unknown()),
  }),
});

export const deployRequestSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

export const deployAllRequestSchema = z.object({
  serviceIds: z.array(z.string()).min(1),
  dryRun: z.boolean().optional().default(false),
});

export const configUpdateSchema = z.object({
  config: z.record(z.unknown()),
});

const oidcClientConfigSchema = z.object({
  clientID: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectURI: z.string().url(),
  callbackURI: z.string().url(),
  scope: z.string().min(1),
});

export const platformOidcSettingsSchema = z.object({
  issuerUri: z.string().url(),
  sciencePortal: oidcClientConfigSchema,
  storageUi: oidcClientConfigSchema,
  skaha: oidcClientConfigSchema,
});
