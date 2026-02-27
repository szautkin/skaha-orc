import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { logger } from './logger.js';
import { swaggerSpec } from './swagger.js';
import { startStatusPolling } from './services/status.service.js';
import { ensureDirectories, copyExampleValues, linkRootCharts, initializeCerts, checkPrerequisites } from './services/bootstrap.service.js';
import { initializeContext } from './routes/kubernetes.js';
import { initializeHostIp, initializeApiKeys } from './routes/services.js';
import { createApp } from './app.js';

const app = createApp();

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(config.port, async () => {
  logger.info({ port: config.port }, 'Skaha Orchestrator backend started');

  await ensureDirectories();
  await copyExampleValues();
  await linkRootCharts();
  await initializeContext();
  await initializeHostIp();
  await initializeApiKeys();
  await initializeCerts();

  const preflight = await checkPrerequisites();
  logger.info(
    { ready: preflight.ready, checks: preflight.checks.map((c) => `${c.id}:${c.status}`) },
    'Bootstrap complete',
  );

  startStatusPolling();
});
