import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { startStatusPolling } from './services/status.service.js';
import healthRoutes from './routes/health.js';
import servicesRoutes from './routes/services.js';
import deployRoutes from './routes/deploy.js';
import kubernetesRoutes from './routes/kubernetes.js';
import certRoutes from './routes/certs.js';
import haproxyRoutes from './routes/haproxy.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api', healthRoutes);
app.use('/api', servicesRoutes);
app.use('/api', deployRoutes);
app.use('/api', kubernetesRoutes);
app.use('/api', certRoutes);
app.use('/api', haproxyRoutes);

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Skaha Orchestrator backend started');
  startStatusPolling();
});
