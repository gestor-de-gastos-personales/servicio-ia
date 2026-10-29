import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GastosApiService } from './gastos-api.service.js';

const fetchMock = vi.fn();

function respuestaJson(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function respuestaError(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as Response;
}

describe('GastosApiService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.API_GASTOS_URL = 'http://api.test/';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_GASTOS_URL;
  });

  it('envía el gasto como POST JSON y devuelve la respuesta tipada', async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ id: 10, descripcion: 'Coto', monto: 1500 }),
    );

    const resultado = await GastosApiService.createExpense({
      monto: 1500,
      comercio: 'Coto',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/gastos',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: 1500, comercio: 'Coto' }),
      }),
    );
    expect(resultado.id).toBe(10);
  });

  it('lanza un error con el status cuando api-gastos falla', async () => {
    fetchMock.mockResolvedValue(respuestaError(500));

    await expect(GastosApiService.createExpense({})).rejects.toThrow(
      'api-gastos respondió 500 en http://api.test/gastos',
    );
  });

  it('codifica el telegramId al pedir el resumen', async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ totalGeneral: 100, porCategoria: [] }),
    );

    const resumen = await GastosApiService.getSummary('55 66');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://api.test/gastos/resumen/bot?telegramId=55%2066',
    );
    expect(resumen.totalGeneral).toBe(100);
  });

  it('devuelve solo las categorías con nombre válido', async () => {
    fetchMock.mockResolvedValue(
      respuestaJson([
        { nombre: 'Alimentación' },
        { nombre: 42 },
        { otro: 'sin nombre' },
        { nombre: 'Transporte' },
      ]),
    );

    await expect(GastosApiService.getCategories()).resolves.toEqual([
      'Alimentación',
      'Transporte',
    ]);
  });

  it('devuelve un array vacío si la respuesta no es una lista', async () => {
    fetchMock.mockResolvedValue(respuestaJson({ no: 'es lista' }));

    await expect(GastosApiService.getCategories()).resolves.toEqual([]);
  });

  it('deduplica categorías con el mismo nombre sin importar mayúsculas', async () => {
    fetchMock.mockResolvedValue(
      respuestaJson([
        { nombre: 'Alimentación' },
        { nombre: 'alimentación' },
        { nombre: 'Transporte' },
      ]),
    );

    await expect(GastosApiService.getCategories()).resolves.toEqual([
      'Alimentación',
      'Transporte',
    ]);
  });

  it('devuelve un array vacío si la petición falla', async () => {
    fetchMock.mockRejectedValue(new Error('sin red'));

    await expect(GastosApiService.getCategories()).resolves.toEqual([]);
  });

  it('indica disponibilidad cuando api-gastos responde ok', async () => {
    fetchMock.mockResolvedValue(respuestaJson([]));

    await expect(GastosApiService.estaDisponible()).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/categorias');
  });

  it('indica no disponibilidad cuando api-gastos falla', async () => {
    fetchMock.mockResolvedValue(respuestaError(503));

    await expect(GastosApiService.estaDisponible()).resolves.toBe(false);
  });

  it('indica no disponibilidad cuando hay un error de red', async () => {
    fetchMock.mockRejectedValue(new Error('sin red'));

    await expect(GastosApiService.estaDisponible()).resolves.toBe(false);
  });
});
