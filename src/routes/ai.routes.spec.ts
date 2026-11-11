import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const mocks = vi.hoisted(() => ({
  parseNaturalLanguageText: vi.fn(),
  processReceiptImage: vi.fn(),
  parsearLote: vi.fn(),
  obtenerCategorias: vi.fn(),
  estaDisponible: vi.fn(),
}));

vi.mock('../services/ai.service.js', () => ({
  parseNaturalLanguageText: mocks.parseNaturalLanguageText,
  processReceiptImage: mocks.processReceiptImage,
  parsearLote: mocks.parsearLote,
}));

vi.mock('../services/categorias.service.js', () => ({
  obtenerCategorias: mocks.obtenerCategorias,
}));

vi.mock('../services/gastos-api.service.js', () => ({
  GastosApiService: { estaDisponible: mocks.estaDisponible },
}));

import { buildApp } from '../app.js';
import type { RespuestaIA } from '../services/respuesta.service.js';

function respuestaIA(
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
      ...data,
    },
  };
}

interface OpcionesMultipart {
  incluirArchivo?: boolean;
  nombreArchivo?: string;
  tipoContenido?: string;
  contenido?: string;
}

function cuerpoMultipart(opciones: OpcionesMultipart = {}) {
  const boundary = '----servicio-ia-test';
  const partes: string[] = [];
  const contenido = opciones.contenido ?? 'imagen-falsa';

  if (opciones.incluirArchivo === false) {
    partes.push(
      [
        '--',
        boundary,
        '\r\nContent-Disposition: form-data; name="texto"\r\n\r\nhola\r\n',
      ].join(''),
    );
  } else {
    partes.push(
      [
        '--',
        boundary,
        '\r\nContent-Disposition: form-data; name="file"; filename="',
        opciones.nombreArchivo ?? 'ticket.jpg',
        '"\r\nContent-Type: ',
        opciones.tipoContenido ?? 'image/jpeg',
        '\r\n\r\n',
        contenido,
        '\r\n',
      ].join(''),
    );
  }

  partes.push(['--', boundary, '--\r\n'].join(''));

  return {
    payload: Buffer.from(partes.join('')),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('rutas de servicio-ia', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mocks.parseNaturalLanguageText.mockReset();
    mocks.processReceiptImage.mockReset();
    mocks.parsearLote.mockReset();
    mocks.obtenerCategorias.mockReset();
    mocks.estaDisponible.mockReset();
    mocks.parseNaturalLanguageText.mockResolvedValue(
      respuestaIA('CREATE_EXPENSE', {
        total: 1500,
        merchant: 'Coto',
        category: 'Alimentación',
        description: 'Compra',
        date: '2026-10-20',
      }),
    );
    mocks.processReceiptImage.mockResolvedValue(
      respuestaIA('CREATE_EXPENSE', { total: 900, merchant: 'Estación' }),
    );
    mocks.parsearLote.mockResolvedValue([
      respuestaIA('CREATE_EXPENSE', { total: 10, merchant: 'Coto' }),
      respuestaIA('GET_SUMMARY', { range: 'WEEK' }),
    ]);
    mocks.obtenerCategorias.mockResolvedValue([
      'Alimentación',
      'Transporte',
      'Ocio y Entretenimiento',
      'Otros / Varios',
    ]);
    mocks.estaDisponible.mockResolvedValue(true);

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/health' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      status: 'ok',
      servicio: 'servicio-ia',
    });
  });

  it('POST /analizar devuelve el gasto normalizado', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar',
      payload: { texto: 'Gasté 1500 en el Coto' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({
      intent: 'CREATE_EXPENSE',
      monto: 1500,
      comercio: 'Coto',
      categoria: 'Alimentación',
      descripcion: 'Compra',
      fecha: '2026-10-20',
      rango: null,
      recurringHint: null,
      searchHint: null,
      campos: null,
    });
    expect(mocks.parseNaturalLanguageText).toHaveBeenCalledWith(
      'Gasté 1500 en el Coto',
    );
  });

  it('POST /analizar rechaza un body sin texto', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar',
      payload: {},
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().statusCode).toBe(400);
    expect(mocks.parseNaturalLanguageText).not.toHaveBeenCalled();
  });

  it('POST /analizar rechaza un texto vacío', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar',
      payload: { texto: '' },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('POST /analizar rechaza propiedades no declaradas', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar',
      payload: { texto: 'gasté 10', extra: true },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(mocks.parseNaturalLanguageText).not.toHaveBeenCalled();
  });

  it('POST /analizar no filtra detalles internos en un error 500', async () => {
    mocks.parseNaturalLanguageText.mockRejectedValue(
      new Error('fallo interno secreto'),
    );

    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar',
      payload: { texto: 'gasté 10' },
    });

    expect(respuesta.statusCode).toBe(500);
    expect(respuesta.json()).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Error interno al procesar la solicitud.',
    });
    expect(respuesta.body).not.toContain('fallo interno secreto');
  });

  it('POST /analizar-imagen procesa un archivo de imagen', async () => {
    const { payload, headers } = cuerpoMultipart();

    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-imagen',
      headers,
      payload,
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      intent: 'CREATE_EXPENSE',
      monto: 900,
      comercio: 'Estación',
    });
    expect(mocks.processReceiptImage).toHaveBeenCalledOnce();
  });

  it('POST /analizar-imagen exige un archivo', async () => {
    const { payload, headers } = cuerpoMultipart({ incluirArchivo: false });

    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-imagen',
      headers,
      payload,
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().message).toContain('archivo de imagen');
    expect(mocks.processReceiptImage).not.toHaveBeenCalled();
  });

  it('POST /analizar-imagen rechaza un body que no es multipart', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-imagen',
      payload: { archivo: 'no-multipart' },
    });

    expect(respuesta.statusCode).toBe(415);
    expect(mocks.processReceiptImage).not.toHaveBeenCalled();
  });

  it('POST /analizar-imagen rechaza archivos que no son imágenes', async () => {
    const { payload, headers } = cuerpoMultipart({
      nombreArchivo: 'nota.txt',
      tipoContenido: 'text/plain',
      contenido: 'no soy una imagen',
    });

    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-imagen',
      headers,
      payload,
    });

    expect(respuesta.statusCode).toBe(415);
    expect(mocks.processReceiptImage).not.toHaveBeenCalled();
  });

  it('POST /analizar-imagen rechaza una imagen vacía', async () => {
    const { payload, headers } = cuerpoMultipart({ contenido: '' });

    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-imagen',
      headers,
      payload,
    });

    expect(respuesta.statusCode).toBe(400);
    expect(mocks.processReceiptImage).not.toHaveBeenCalled();
  });

  it('GET /ready responde ok cuando api-gastos está disponible', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/ready' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      status: 'ok',
      servicio: 'servicio-ia',
      apiGastos: true,
    });
  });

  it('GET /ready responde 503 cuando api-gastos no está disponible', async () => {
    mocks.estaDisponible.mockResolvedValue(false);

    const respuesta = await app.inject({ method: 'GET', url: '/ready' });

    expect(respuesta.statusCode).toBe(503);
    expect(respuesta.json()).toMatchObject({
      status: 'degraded',
      apiGastos: false,
    });
  });

  it('GET /version devuelve la versión y el proveedor activo', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/version' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      servicio: 'servicio-ia',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      aiProvider: expect.stringMatching(/openrouter|ollama/),
    });
  });

  it('GET /intents devuelve el catálogo de intenciones', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/intents' });
    const cuerpo = respuesta.json() as { intents: string[]; total: number };

    expect(respuesta.statusCode).toBe(200);
    expect(cuerpo.intents).toContain('CREATE_EXPENSE');
    expect(cuerpo.intents).toContain('GET_SUMMARY');
    expect(cuerpo.total).toBe(cuerpo.intents.length);
  });

  it('GET /categorias devuelve las categorías reales', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/categorias' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({
      categorias: [
        'Alimentación',
        'Transporte',
        'Ocio y Entretenimiento',
        'Otros / Varios',
      ],
      total: 4,
    });
  });

  it('POST /analizar-lote procesa varios textos en orden', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-lote',
      payload: { textos: ['gasté 10 en el Coto', 'resumen semanal'] },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(mocks.parsearLote).toHaveBeenCalledWith([
      'gasté 10 en el Coto',
      'resumen semanal',
    ]);
    expect(respuesta.json()).toMatchObject({
      resultados: [
        { intent: 'CREATE_EXPENSE', monto: 10, comercio: 'Coto' },
        { intent: 'GET_SUMMARY', rango: 'WEEK' },
      ],
    });
  });

  it('POST /analizar-lote rechaza una lista vacía', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-lote',
      payload: { textos: [] },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(mocks.parsearLote).not.toHaveBeenCalled();
  });

  it('POST /analizar-lote rechaza propiedades no declaradas', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/analizar-lote',
      payload: { textos: ['hola'], extra: true },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('POST /normalizar-categoria infiere la categoría por comercio', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/normalizar-categoria',
      payload: { comercio: 'Netflix' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({
      categoria: 'Ocio y Entretenimiento',
      comercio: 'Netflix',
    });
  });

  it('POST /normalizar-categoria exige el comercio', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/normalizar-categoria',
      payload: {},
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('POST /validar-respuesta acepta un JSON válido', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/validar-respuesta',
      payload: {
        contenido: JSON.stringify({
          intent: 'CREATE_EXPENSE',
          data: { total: 10 },
        }),
      },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      valida: true,
      respuesta: { intent: 'CREATE_EXPENSE', data: { total: 10 } },
    });
  });

  it('POST /validar-respuesta rechaza un JSON inválido', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/validar-respuesta',
      payload: { contenido: 'no es json' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({ valida: false });
  });
});
