import { GastosApiService } from './gastos-api.service.js';

const TTL_POR_DEFECTO_MS = 60_000;

interface EntradaCache {
  categorias: string[];
  expira: number;
}

let cache: EntradaCache | null = null;

function ttlMs(): number {
  const valor = Number(process.env.CATEGORIAS_CACHE_MS);
  return Number.isFinite(valor) && valor >= 0 ? valor : TTL_POR_DEFECTO_MS;
}

/**
 * Devuelve las categorías de api-gastos con una caché corta en memoria.
 * Evita golpear la API en cada análisis sin quedar desactualizado por mucho
 * tiempo cuando se crean categorías nuevas.
 */
export async function obtenerCategorias(): Promise<string[]> {
  const ahora = Date.now();

  if (cache && cache.expira > ahora) {
    return cache.categorias;
  }

  const categorias = await GastosApiService.getCategories();
  cache = { categorias, expira: ahora + ttlMs() };
  return categorias;
}

/** Invalida la caché (útil en tests y tras crear una categoría). */
export function limpiarCacheCategorias(): void {
  cache = null;
}
