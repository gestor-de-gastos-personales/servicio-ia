import { describe, expect, it } from 'vitest';
import { parsearRespuesta } from './respuesta.service.js';

describe('parsearRespuesta', () => {
  it('normaliza un JSON válido con total numérico en texto', () => {
    const contenido = JSON.stringify({
      intent: 'CREATE_EXPENSE',
      data: {
        total: '1500.50',
        merchant: 'Coto',
        category: 'Alimentación',
        description: 'Compra semanal',
      },
    });

    expect(parsearRespuesta(contenido)).toEqual({
      intent: 'CREATE_EXPENSE',
      data: {
        total: 1500.5,
        merchant: 'Coto',
        category: 'Alimentación',
        description: 'Compra semanal',
        date: null,
        range: null,
      },
    });
  });

  it('normaliza la fecha y el rango solicitados', () => {
    const contenido = JSON.stringify({
      intent: 'GET_SUMMARY',
      data: { date: '2026-10-20', range: '15_DAYS' },
    });

    expect(parsearRespuesta(contenido)).toEqual({
      intent: 'GET_SUMMARY',
      data: {
        total: null,
        merchant: null,
        category: null,
        description: null,
        date: '2026-10-20',
        range: '15_DAYS',
      },
    });
  });

  it('descarta fechas y rangos inválidos', () => {
    const contenido = JSON.stringify({
      intent: 'CREATE_EXPENSE',
      data: { date: '20/10/2026', range: 'SEMANA' },
    });

    const resultado = parsearRespuesta(contenido);

    expect(resultado.data.date).toBeNull();
    expect(resultado.data.range).toBeNull();
  });

  it('devuelve UNKNOWN y nulos ante JSON inválido', () => {
    expect(parsearRespuesta('esto no es json')).toEqual({
      intent: 'UNKNOWN',
      data: {
        total: null,
        merchant: null,
        category: null,
        description: null,
        date: null,
        range: null,
      },
    });
  });

  it('devuelve UNKNOWN cuando el contenido es null o vacío', () => {
    expect(parsearRespuesta(null).intent).toBe('UNKNOWN');
    expect(parsearRespuesta(undefined).intent).toBe('UNKNOWN');
    expect(parsearRespuesta('').intent).toBe('UNKNOWN');
  });

  it('descarta campos con tipos incorrectos', () => {
    const contenido = JSON.stringify({
      intent: 42,
      data: {
        total: 'no-es-numero',
        merchant: 123,
        category: ['Alimentación'],
        description: true,
      },
    });

    expect(parsearRespuesta(contenido)).toEqual({
      intent: 'UNKNOWN',
      data: {
        total: null,
        merchant: null,
        category: null,
        description: null,
        date: null,
        range: null,
      },
    });
  });

  it('devuelve UNKNOWN si el JSON es un array o un valor primitivo', () => {
    expect(parsearRespuesta('[1,2,3]').intent).toBe('UNKNOWN');
    expect(parsearRespuesta('"texto"').intent).toBe('UNKNOWN');
  });

  it('tolera un objeto sin la clave data', () => {
    const resultado = parsearRespuesta('{"intent":"GET_SUMMARY"}');

    expect(resultado.intent).toBe('GET_SUMMARY');
    expect(resultado.data.total).toBeNull();
  });
});
