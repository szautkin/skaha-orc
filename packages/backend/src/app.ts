import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import servicesRoutes from './routes/services.js';
import deployRoutes from './routes/deploy.js';
import kubernetesRoutes from './routes/kubernetes.js';
import certRoutes from './routes/certs.js';
import haproxyRoutes from './routes/haproxy.js';
import oidcRoutes from './routes/oidc.js';
import dexRoutes from './routes/dex.js';
import tlsRoutes from './routes/tls.js';

export function createApp(): express.Express {
  const app = express();

  const corsOrigins = process.env.CORS_ORIGINS;
  if (corsOrigins) {
    app.use(cors({ origin: corsOrigins.split(',').map((o) => o.trim()) }));
  } else {
    app.use(cors());
  }
  app.use(express.json({ limit: '1mb' }));

  // Routes
  app.use('/api', healthRoutes);
  app.use('/api', servicesRoutes);
  app.use('/api', deployRoutes);
  app.use('/api', kubernetesRoutes);
  app.use('/api', certRoutes);
  app.use('/api', haproxyRoutes);
  app.use('/api', oidcRoutes);
  app.use('/api', dexRoutes);
  app.use('/api', tlsRoutes);

  return app;
}
