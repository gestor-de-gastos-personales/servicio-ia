import { describe, expect, it } from 'vitest';
import {
  INTENCIONES_SOPORTADAS,
  intencionesComoUnion,
} from './intenciones.js';

describe('intenciones', () => {
  it('incluye las intenciones base del prompt', () => {
    expect(INTENCIONES_SOPORTADAS).toContain('CREATE_EXPENSE');
    expect(INTENCIONES_SOPORTADAS).toContain('GET_SUMMARY');
    expect(INTENCIONES_SOPORTADAS).toContain('UNKNOWN');
  });

  it('arma la unión para incrustar en el prompt', () => {
    const union = intencionesComoUnion();

    expect(union).toContain('"CREATE_EXPENSE"');
    expect(union).toContain(' | ');
    expect(union.split(' | ')).toHaveLength(INTENCIONES_SOPORTADAS.length);
  });
});
