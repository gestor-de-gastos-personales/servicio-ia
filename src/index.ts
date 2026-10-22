import 'dotenv/config';
import { buildApp } from './app.js';

async function iniciar(): Promise<void> {
  const app = await buildApp();

  try {
    const port = Number(process.env.PORT) || 3002;
    const host = process.env.HOST || '127.0.0.1';

    await app.listen({ port, host });
    app.log.info(
      { port, host, url: `http://${host}:${port}` },
      'servicio-ia listo para recibir solicitudes',
    );
  } catch (error) {
    app.log.error({ err: error }, 'No se pudo iniciar servicio-ia');
    process.exit(1);
  }
}

void iniciar();
