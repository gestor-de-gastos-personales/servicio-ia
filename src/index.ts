import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({
  logger: true,
});

const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  await fastify.register(cors, {
    origin: true,
  });

  fastify.get('/health', async () => {
    return { status: 'ok', service: 'servicio-ia' };
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Servidor de IA corriendo en http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();