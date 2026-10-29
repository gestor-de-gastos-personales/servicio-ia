import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCategories: vi.fn() }));

vi.mock('./gastos-api.service.js', () => ({
  GastosApiService: { getCategories: mocks.getCategories },
}));

import {
  limpiarCacheCategorias,
  obtenerCategorias,
} from './categorias.service.js';

describe('categorias.service', () => {
  beforeEach(() => {
    mocks.getCategories.mockReset();
    limpiarCacheCategorias();
    delete process.env.CATEGORIAS_CACHE_MS;
  });

  afterEach(() => {
    delete process.env.CATEGORIAS_CACHE_MS;
  });

  it('delega en api-gastos la primera vez', async () => {
    mocks.getCategories.mockResolvedValue(['Alimentación']);

    await expect(obtenerCategorias()).resolves.toEqual(['Alimentación']);
    expect(mocks.getCategories).toHaveBeenCalledOnce();
  });

  it('usa la caché en llamadas siguientes', async () => {
    mocks.getCategories.mockResolvedValue(['Alimentación']);

    await obtenerCategorias();
    await obtenerCategorias();

    expect(mocks.getCategories).toHaveBeenCalledOnce();
  });

  it('vuelve a consultar si el TTL es cero', async () => {
    process.env.CATEGORIAS_CACHE_MS = '0';
    mocks.getCategories.mockResolvedValue(['Alimentación']);

    await obtenerCategorias();
    await obtenerCategorias();

    expect(mocks.getCategories).toHaveBeenCalledTimes(2);
  });

  it('refresca la caché al limpiarla', async () => {
    mocks.getCategories.mockResolvedValue(['Alimentación']);

    await obtenerCategorias();
    limpiarCacheCategorias();
    await obtenerCategorias();

    expect(mocks.getCategories).toHaveBeenCalledTimes(2);
  });
});
