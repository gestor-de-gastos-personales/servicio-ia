import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  crearChat: vi.fn(),
  ollamaChat: vi.fn(),
  getCategories: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: mocks.crearChat } } };
  }),
}));

vi.mock('ollama', () => ({
  Ollama: vi.fn(function () {
    return { chat: mocks.ollamaChat };
  }),
}));

vi.mock('./gastos-api.service.js', () => ({
  GastosApiService: { getCategories: mocks.getCategories },
}));

import {
  parseNaturalLanguageText,
  parsearLote,
  processReceiptImage,
} from './ai.service.js';

function contenidoOpenRouter(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

describe('ai.service', () => {
  beforeEach(() => {
    mocks.crearChat.mockReset();
    mocks.ollamaChat.mockReset();
    mocks.getCategories.mockReset().mockResolvedValue(['Alimentación', 'Transporte']);
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    vi.stubEnv('OPENROUTER_API_KEY', 'clave-de-prueba');
    vi.stubEnv('OPENROUTER_MODEL', 'modelo-texto');
    vi.stubEnv('OPENROUTER_VISION_MODEL', 'modelo-vision');
    vi.stubEnv('OLLAMA_MODEL', 'modelo-ollama');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('analiza texto con OpenRouter usando el modelo de texto', async () => {
    mocks.crearChat.mockResolvedValue(
      contenidoOpenRouter({
        intent: 'CREATE_EXPENSE',
        data: {
          total: 1500,
          merchant: 'Coto',
          category: 'Alimentación',
          description: 'Compra semanal',
          date: '2026-10-20',
        },
      }),
    );

    const resultado = await parseNaturalLanguageText('Gasté 1500 en el Coto');

    expect(resultado).toEqual({
      intent: 'CREATE_EXPENSE',
      data: {
        total: 1500,
        merchant: 'Coto',
        category: 'Alimentación',
        description: 'Compra semanal',
        date: '2026-10-20',
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
      },
    });
    expect(mocks.crearChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'modelo-texto',
        response_format: { type: 'json_object' },
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('[Alimentación, Transporte]'),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('CONTEXTO TEMPORAL'),
          }),
          { role: 'user', content: 'Gasté 1500 en el Coto' },
        ]),
      }),
    );
  });

  it('analiza una imagen con OpenRouter usando el modelo de visión', async () => {
    mocks.crearChat.mockResolvedValue(
      contenidoOpenRouter({
        intent: 'CREATE_EXPENSE',
        data: { total: 900, merchant: 'Estación', category: 'Transporte' },
      }),
    );

    const resultado = await processReceiptImage(Buffer.from('foto'));

    expect(resultado.data.total).toBe(900);
    expect(mocks.crearChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'modelo-vision',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({ type: 'image_url' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('prueba el modelo de respaldo cuando el principal da 429', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', 'modelo-respaldo');
    mocks.crearChat
      .mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }))
      .mockResolvedValueOnce(
        contenidoOpenRouter({ intent: 'GET_SUMMARY', data: {} }),
      );

    const resultado = await parseNaturalLanguageText('¿cuánto gasté?');

    expect(resultado.intent).toBe('GET_SUMMARY');
    expect(mocks.crearChat).toHaveBeenCalledTimes(2);
    expect(mocks.crearChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'modelo-respaldo' }),
    );
  });

  it('usa el respaldo de visión si el principal no devuelve contenido', async () => {
    vi.stubEnv('OPENROUTER_VISION_FALLBACK_MODELS', 'modelo-vision-respaldo');
    mocks.crearChat
      .mockResolvedValueOnce({ choices: [] })
      .mockResolvedValueOnce(
        contenidoOpenRouter({ intent: 'CREATE_EXPENSE', data: { total: 500 } }),
      );

    const resultado = await processReceiptImage(Buffer.from('foto'));

    expect(resultado.data.total).toBe(500);
    expect(mocks.crearChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'modelo-vision-respaldo' }),
    );
  });

  it('no prueba respaldos con un error no reintentable', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', 'modelo-respaldo');
    mocks.crearChat.mockRejectedValue(
      Object.assign(new Error('400 petición inválida'), { status: 400 }),
    );

    await expect(parseNaturalLanguageText('hola')).rejects.toThrow('400');
    expect(mocks.crearChat).toHaveBeenCalledTimes(1);
  });

  it('propaga el error cuando hubo límite y ningún modelo devolvió contenido', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', 'modelo-respaldo');
    mocks.crearChat
      .mockRejectedValueOnce(Object.assign(new Error('429 límite'), { status: 429 }))
      .mockResolvedValueOnce({ choices: [] });

    await expect(parseNaturalLanguageText('hola')).rejects.toThrow('429');
  });

  it('usa Ollama cuando AI_PROVIDER=ollama', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    mocks.ollamaChat.mockResolvedValue({
      message: {
        content: JSON.stringify({ intent: 'GET_SUMMARY', data: {} }),
      },
    });

    const resultado = await parseNaturalLanguageText('¿cuánto gasté?');

    expect(resultado.intent).toBe('GET_SUMMARY');
    expect(mocks.ollamaChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'modelo-ollama',
        format: 'json',
        messages: expect.arrayContaining([
          { role: 'user', content: '¿cuánto gasté?' },
        ]),
      }),
    );
    expect(mocks.crearChat).not.toHaveBeenCalled();
  });

  it('envía la imagen en base64 cuando el proveedor es Ollama', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    mocks.ollamaChat.mockResolvedValue({
      message: { content: JSON.stringify({ intent: 'UNKNOWN', data: {} }) },
    });

    await processReceiptImage(Buffer.from('ticket'));

    expect(mocks.ollamaChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'modelo-ollama',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            images: [Buffer.from('ticket').toString('base64')],
          }),
        ]),
      }),
    );
  });

  it('usa OLLAMA_VISION_MODEL para las imágenes cuando está configurado', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    vi.stubEnv('OLLAMA_VISION_MODEL', 'modelo-ollama-vision');
    mocks.ollamaChat.mockResolvedValue({
      message: { content: JSON.stringify({ intent: 'UNKNOWN', data: {} }) },
    });

    await processReceiptImage(Buffer.from('ticket'));

    expect(mocks.ollamaChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'modelo-ollama-vision' }),
    );
  });

  it('con Ollama usa el modelo de texto aunque haya un modelo de visión configurado', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    vi.stubEnv('OLLAMA_VISION_MODEL', 'modelo-ollama-vision');
    mocks.ollamaChat.mockResolvedValue({
      message: { content: JSON.stringify({ intent: 'GET_SUMMARY', data: {} }) },
    });

    await parseNaturalLanguageText('¿cuánto gasté?');

    expect(mocks.ollamaChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'modelo-ollama' }),
    );
  });
  it('devuelve UNKNOWN si el modelo no devuelve contenido', async () => {
    mocks.crearChat.mockResolvedValue({ choices: [] });

    const resultado = await parseNaturalLanguageText('hola');

    expect(resultado.intent).toBe('UNKNOWN');
    expect(resultado.data.total).toBeNull();
  });

  it('usa las categorías de respaldo si api-gastos no devuelve ninguna', async () => {
    mocks.getCategories.mockResolvedValue([]);
    mocks.crearChat.mockResolvedValue(
      contenidoOpenRouter({ intent: 'CREATE_EXPENSE', data: { total: 10 } }),
    );

    await parseNaturalLanguageText('gasté 10');

    expect(mocks.crearChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Servicios, Hogar, Salud'),
          }),
        ]),
      }),
    );
  });

  it('analiza un lote de textos respetando el orden', async () => {
    mocks.crearChat.mockResolvedValue(
      contenidoOpenRouter({ intent: 'CREATE_EXPENSE', data: { total: 5 } }),
    );

    const resultados = await parsearLote(['uno', 'dos', 'tres']);

    expect(resultados).toHaveLength(3);
    expect(resultados.every((r) => r.intent === 'CREATE_EXPENSE')).toBe(true);
    expect(mocks.crearChat).toHaveBeenCalledTimes(3);
  });
});
