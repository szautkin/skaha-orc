import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { logger } from './logger.js';
import { swaggerSpec } from './swagger.js';
import { startStatusPolling } from './services/status.service.js';
import { ensureDirectories, copyExampleValues, checkPrerequisites } from './services/bootstrap.service.js';
import healthRoutes from './routes/health.js';
import servicesRoutes from './routes/services.js';
import deployRoutes from './routes/deploy.js';
import kubernetesRoutes from './routes/kubernetes.js';
import certRoutes from './routes/certs.js';
import haproxyRoutes from './routes/haproxy.js';
import oidcRoutes from './routes/oidc.js';
import dexRoutes from './routes/dex.js';

const app = express();

const corsOrigins = process.env.CORS_ORIGINS;
if (corsOrigins) {
  app.use(cors({ origin: corsOrigins.split(',').map((o) => o.trim()) }));
} else {
  app.use(cors());
}
app.use(express.json({ limit: '1mb' }));

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api', healthRoutes);
app.use('/api', servicesRoutes);
app.use('/api', deployRoutes);
app.use('/api', kubernetesRoutes);
app.use('/api', certRoutes);
app.use('/api', haproxyRoutes);
app.use('/api', oidcRoutes);
app.use('/api', dexRoutes);

app.listen(config.port, async () => {
  logger.info({ port: config.port }, 'Skaha Orchestrator backend started');

  await ensureDirectories();
  await copyExampleValues();
  const preflight = await checkPrerequisites();
  logger.info(
    { ready: preflight.ready, checks: preflight.checks.map((c) => `${c.id}:${c.status}`) },
    'Bootstrap complete',
  );

  startStatusPolling();
});
