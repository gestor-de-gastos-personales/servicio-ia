import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearOpcionesLogger } from './logger.js';

interface OpcionesPretty {
  level: string;
  transport?: {
    target: string;
    options: { colorize: boolean };
  };
}

describe('crearOpcionesLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('en producción emite JSON con el nivel configurado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'warn');

    expect(crearOpcionesLogger()).toEqual({ level: 'warn' });
  });

  it('en desarrollo usa pino-pretty con colores', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', '');

    const opciones = crearOpcionesLogger() as OpcionesPretty;

    expect(opciones.level).toBe('info');
    expect(opciones.transport?.target).toBe('pino-pretty');
    expect(opciones.transport?.options.colorize).toBe(true);
  });

  it('respeta LOG_LEVEL en desarrollo', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', 'debug');

    expect((crearOpcionesLogger() as OpcionesPretty).level).toBe('debug');
  });
});
