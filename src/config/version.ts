import { readFileSync } from 'node:fs';

interface Paquete {
  version?: string;
}

/**
 * Lee la versión declarada en package.json. Si no se puede leer (por ejemplo
 * en un empaquetado que no incluye el archivo) devuelve `0.0.0`.
 */
export function obtenerVersion(): string {
  try {
    const url = new URL('../../package.json', import.meta.url);
    const paquete = JSON.parse(readFileSync(url, 'utf8')) as Paquete;
    return paquete.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
