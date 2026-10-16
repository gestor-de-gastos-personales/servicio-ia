import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { aiRoutes } from './routes/ai.routes';

const fastify = Fastify({ logger: true });

fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // Límite de 10 MB por imagen
  },
});

fastify.register(aiRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 8000;
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
    console.log(`🚀 Servicio IA corriendo en http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();