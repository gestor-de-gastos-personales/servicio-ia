import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { aiRoutes } from './routes/ai.routes.js';

const fastify = Fastify({
  logger: true,
});

// Registro del plugin para recepción de archivos/imágenes
fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // Límite máximo de 10 MB
  },
});

// Registro de las rutas expuestas por el servicio
fastify.register(aiRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3002;
    const host = process.env.HOST || '127.0.0.1';

    await fastify.listen({ port, host });
    console.log(`🚀 servicio-ia escuchando en http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();