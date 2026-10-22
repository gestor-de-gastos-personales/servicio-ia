import Fastify from 'fastify';
import type {
  FastifyError,
  FastifyInstance,
  FastifyServerOptions,
} from 'fastify';
import multipart from '@fastify/multipart';
import { crearOpcionesLogger } from './config/logger.js';
import { aiRoutes } from './routes/ai.routes.js';

export interface OpcionesApp {
  /** Permite desactivar el logger en tests (`false`). */
  logger?: FastifyServerOptions['logger'];
}

function nombreEstado(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 413:
      return 'Payload Too Large';
    case 415:
      return 'Unsupported Media Type';
    default:
      return statusCode >= 500 ? 'Internal Server Error' : 'Error';
  }
}

/**
 * Construye la aplicación Fastify con plugins, validación estricta y manejo
 * centralizado de errores. Se exporta para poder testear con `inject()`.
 */
export async function buildApp(
  opciones: OpcionesApp = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opciones.logger ?? crearOpcionesLogger(),
    ajv: {
      customOptions: {
        // No eliminar campos extra: si el body trae propiedades no declaradas,
        // la validación responde 400 en lugar de ignorarlas.
        removeAdditional: false,
        // No convertir tipos automáticamente: el contrato es estricto.
        coerceTypes: false,
      },
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      typeof error.statusCode === 'number' ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Error interno al procesar la solicitud');
    } else {
      request.log.warn(
        { code: error.code, message: error.message },
        'Solicitud rechazada',
      );
    }

    return reply.status(statusCode).send({
      statusCode,
      error: nombreEstado(statusCode),
      message:
        statusCode >= 500
          ? 'Error interno al procesar la solicitud.'
          : error.message,
    });
  });

  await app.register(aiRoutes);

  return app;
}
