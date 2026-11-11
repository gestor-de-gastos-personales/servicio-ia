import { describe, expect, it } from 'vitest';
import {
  inferirCategoriaPorComercio,
  normalizarCategoria,
} from './categoria.service.js';
import type { RespuestaIA } from './respuesta.service.js';

const CATEGORIAS = [
  'Alimentación',
  'Transporte',
  'Servicios',
  'Ocio y Entretenimiento',
  'Suscripciones y Tecnología',
  'Salud y Bienestar',
  'Otros / Varios',
];

function respuesta(
  intent: string,
  data: Partial<RespuestaIA['data']> = {},
): RespuestaIA {
  return {
    intent,
    data: {
      total: null,
      merchant: null,
      category: null,
      description: null,
      date: null,
      range: null,
      frecuencia: null,
      dia: null,
      searchHint: null,
      target: null,
      campo: null,
      valor: null,
      query: null,
      campos: null,
      recurringHint: null,
      ...data,
    },
  };
}

describe('normalizarCategoria', () => {
  it('resuelve una categoría exacta sin importar mayúsculas', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { category: 'transporte' }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Transporte');
  });

  it('resuelve una categoría por coincidencia parcial', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { category: 'ocio' }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Ocio y Entretenimiento');
  });

  it('corrige la categoría según el comercio de combustible', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', {
        category: 'Alimentación',
        merchant: 'YPF',
      }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Transporte');
  });

  it('mantiene alimentación cuando el comercio es de comida rápida', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', {
        category: 'Transporte',
        merchant: "McDonald's",
      }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Alimentación');
  });

  it('asigna varios cuando la categoría no existe en la lista', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { category: 'Inversiones' }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Otros / Varios');
  });

  it('asigna varios a un CREATE_EXPENSE sin categoría', () => {
    const resultado = normalizarCategoria(respuesta('CREATE_EXPENSE'), {
      categorias: CATEGORIAS,
      esVision: false,
    });

    expect(resultado.data.category).toBe('Otros / Varios');
  });

  it('no toca la categoría de intenciones que no crean gastos', () => {
    const resultado = normalizarCategoria(
      respuesta('GET_SUMMARY', { category: 'Cualquiera' }),
      { categorias: CATEGORIAS, esVision: false },
    );

    expect(resultado.data.category).toBe('Cualquiera');
  });

  it('ignora la categoría del ticket en visión y la infiere por comercio', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', {
        category: 'Alimentación',
        merchant: 'Netflix',
      }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Ocio y Entretenimiento');
    expect(resultado.data.merchant).toBe('Netflix');
  });

  it('normaliza la marca de un comercio de streaming en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'netflix.com' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.merchant).toBe('Netflix');
  });

  it('asigna servicios a un comercio de telefonía en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'Claro' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Servicios');
  });

  it('asigna otros/varios a un gimnasio en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'Smartfit' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Otros / Varios');
    expect(resultado.data.merchant).toBe('Smartfit');
  });

  it('asigna salud a una farmacia en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'Farmacia Del Pueblo' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Salud y Bienestar');
  });

  it('usa la categoría existente que aparezca en el texto en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'Transporte Sur' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Transporte');
  });

  it('cae en varios si no puede inferir el comercio en visión', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { merchant: 'Comercio Desconocido' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBe('Otros / Varios');
  });

  it('no modifica nada si la lista de categorías está vacía', () => {
    const resultado = normalizarCategoria(
      respuesta('CREATE_EXPENSE', { category: 'Alimentación' }),
      { categorias: [], esVision: false },
    );

    expect(resultado.data.category).toBe('Alimentación');
  });

  it('no normaliza por comercio en visión si la intención no crea un gasto', () => {
    const resultado = normalizarCategoria(
      respuesta('GET_SUMMARY', { merchant: 'Netflix' }),
      { categorias: CATEGORIAS, esVision: true },
    );

    expect(resultado.data.category).toBeNull();
  });
});

describe('inferirCategoriaPorComercio', () => {
  it('infiere la categoría de un comercio de streaming', () => {
    expect(
      inferirCategoriaPorComercio({
        comercio: 'netflix',
        categorias: CATEGORIAS,
      }),
    ).toEqual({
      categoria: 'Ocio y Entretenimiento',
      comercio: 'Netflix',
    });
  });

  it('infiere la categoría de un supermercado', () => {
    expect(
      inferirCategoriaPorComercio({
        comercio: 'Coto',
        categorias: CATEGORIAS,
      }).categoria,
    ).toBe('Alimentación');
  });

  it('cae en varios ante un comercio desconocido', () => {
    expect(
      inferirCategoriaPorComercio({
        comercio: 'Ferretería Pepito',
        categorias: CATEGORIAS,
      }).categoria,
    ).toBe('Otros / Varios');
  });

  it('devuelve categoría nula si no hay categorías disponibles', () => {
    expect(
      inferirCategoriaPorComercio({ comercio: 'Netflix', categorias: [] }),
    ).toEqual({ categoria: null, comercio: 'Netflix' });
  });
});
