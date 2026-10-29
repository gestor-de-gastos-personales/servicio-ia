import { describe, expect, it } from 'vitest';
import { obtenerVersion } from './version.js';

describe('obtenerVersion', () => {
  it('devuelve la versión de package.json', () => {
    expect(obtenerVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
