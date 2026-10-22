import type { FastifyServerOptions } from 'fastify';

const NIVEL_POR_DEFECTO = 'info';

/**
 * Configura pino, el logger nativo de Fastify.
 *
 * - En desarrollo usa `pino-pretty` con colores para que la consola sea legible.
 * - En producción emite JSON estructurado (ideal para agregadores de logs).
 */
export function crearOpcionesLogger(): NonNullable<
  FastifyServerOptions['logger']
> {
  const level = process.env.LOG_LEVEL || NIVEL_POR_DEFECTO;

  if (process.env.NODE_ENV === 'production') {
    return { level };
  }

  return {
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    },
  };
}
