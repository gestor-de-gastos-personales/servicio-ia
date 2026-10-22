import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const mocks = vi.hoisted(() => ({
  parseNaturalLanguageText: vi.fn(),
  processReceiptImage: vi.fn(),
}));

vi.mock('../services/ai.service.js', () => ({
  parseNaturalLanguageText: mocks.parseNaturalLanguageText,
  processReceiptImage: mocks.processReceiptImage,
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
  const partes: Buffer[] = [];

  if (opciones.incluirArchivo === false) {
    partes.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="texto"\r\n\r\nhola\r\n`,
      ),
    );
  } else {
    partes.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${
          opciones.nombreArchivo ?? 'ticket.jpg'
        }"\r\nContent-Type: ${
          opciones.tipoContenido ?? 'image/jpeg'
        }\r\n\r\n`,
      ),
      Buffer.from(opciones.contenido ?? 'imagen-falsa'),
      Buffer.from('\r\n'),
    );
  }

  partes.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(partes),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('rutas de servicio-ia', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mocks.parseNaturalLanguageText.mockReset();
    mocks.processReceiptImage.mockReset();
    mocks.parseNaturalLanguageText.mockResolvedValue(
      respuestaIA('CREATE_EXPENSE', {
        total: 1500,
        merchant: 'Coto',
        category: 'Alimentación',
        description: 'Compra',
      }),
    );
    mocks.processReceiptImage.mockResolvedValue(
      respuestaIA('CREATE_EXPENSE', { total: 900, merchant: 'Estación' }),
    );

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
});
