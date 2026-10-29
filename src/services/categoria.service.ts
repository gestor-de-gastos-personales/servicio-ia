/**
 * Normalización de categorías y comercios contra la lista real de api-gastos.
 *
 * Se aísla del cliente de IA para poder testear las reglas sin llamadas de red.
 * Las familias de categorías se resuelven por palabra clave para no depender de
 * los nombres exactos que tenga configurados cada usuario.
 */
import { crearRespuestaVacia } from './respuesta.service.js';
import type { RespuestaIA } from './respuesta.service.js';

export interface OpcionesNormalizacion {
  /** Nombres reales de las categorías vigentes en api-gastos. */
  categorias: string[];
  /** Indica si la respuesta proviene de visión (foto de ticket). */
  esVision: boolean;
}

type PredicadoCategoria = (nombreLower: string) => boolean;

const FAMILIAS = {
  ocio: (n) =>
    n.includes('ocio') ||
    n.includes('entreten') ||
    n.includes('suscrip') ||
    n.includes('tecnolog'),
  varios: (n) => n.includes('varios'),
  otrosVarios: (n) => n === 'otros / varios' || n === 'otros',
  servicios: (n) => n.includes('servic') || n.includes('factur'),
  serviciosTelecom: (n) =>
    n.includes('servic') || n.includes('factur') || n.includes('suscrip'),
  suscripcionTecnologia: (n) =>
    n.includes('suscrip') || n.includes('tecnolog'),
  salud: (n) => n.includes('salud') || n.includes('bienestar'),
  alimentacionExacta: (n) =>
    n === 'alimentación' || n === 'alimentacion',
  alimentacion: (n) => n.includes('aliment'),
  restaurante: (n) => n === 'restaurante',
  transporte: (n) => n === 'transporte',
  gymPreferida: (n) =>
    n === 'otros / varios' ||
    n.includes('varios') ||
    n.includes('salud') ||
    n.includes('bienestar'),
} satisfies Record<string, PredicadoCategoria>;

type Familia = keyof typeof FAMILIAS;

interface ComercioCanonico {
  nombre: string;
  /** `siempre` pisa el comercio del modelo; `siVacio` solo lo completa. */
  modo: 'siempre' | 'siVacio';
}

interface ReglaComercio {
  patron: RegExp;
  comercio?: ComercioCanonico;
}

interface ReglaCategoria extends ReglaComercio {
  familias: Familia[];
}

/** Intenciones en las que `category` es un valor que se va a persistir. */
const INTENCIONES_QUE_ESCRIBEN = new Set([
  'CREATE_EXPENSE',
  'EDIT_EXPENSE',
  'UPDATE_EXPENSE',
]);

/** Intenciones en las que `category` funciona como filtro de búsqueda. */
const INTENCIONES_DE_FILTRO = new Set([
  'GET_SUMMARY',
  'LIST_EXPENSES',
  'SHOW_EXPENSE',
  'DELETE_EXPENSE',
  'EXPORT_EXPENSES',
]);

// --- Reglas por comercio -----------------------------------------------------

const REGLAS_STREAMING: ReglaCategoria[] = [
  {
    patron: /\bspotify\b/,
    comercio: { nombre: 'Spotify', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bnetflix\b/,
    comercio: { nombre: 'Netflix', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bdisney\b|\bdisney\+/,
    comercio: { nombre: 'Disney+', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bamazon\s*prime\b|\bprime\s*video\b/,
    comercio: { nombre: 'Amazon Prime', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bhbo\b|\bhbo\s*max\b/,
    comercio: { nombre: 'HBO Max', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bparamount\b|\bparamount\+/,
    comercio: { nombre: 'Paramount+', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bstar\+\b|\bstar\s*plus\b/,
    comercio: { nombre: 'Star+', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\byoutube\s*premium\b/,
    comercio: { nombre: 'YouTube Premium', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bapple\s*music\b/,
    comercio: { nombre: 'Apple Music', modo: 'siempre' },
    familias: ['ocio', 'varios', 'otrosVarios'],
  },
  {
    patron: /\bicloud\b/,
    comercio: { nombre: 'iCloud', modo: 'siempre' },
    familias: ['suscripcionTecnologia', 'ocio', 'varios'],
  },
  {
    patron: /\bgoogle\s*one\b/,
    comercio: { nombre: 'Google One', modo: 'siempre' },
    familias: ['suscripcionTecnologia', 'ocio', 'varios'],
  },
];

const PATRON_STREAMING_SECUNDARIO =
  /(crunchyroll|dazn|flow|directv|star\s*play)/;

const REGLAS_STREAMING_SECUNDARIAS: ReglaComercio[] = [
  { patron: /crunchyroll/, comercio: { nombre: 'Crunchyroll', modo: 'siVacio' } },
  { patron: /dazn/, comercio: { nombre: 'DAZN', modo: 'siVacio' } },
  { patron: /flow/, comercio: { nombre: 'Flow', modo: 'siVacio' } },
  { patron: /directv/, comercio: { nombre: 'DirecTV', modo: 'siVacio' } },
];

const PATRON_TELECOM =
  /(claro|movistar|personal|fibertel|telecentro|tuenti|cablevision|cable|internet|telefonia|telefon)/;

const REGLAS_TELECOM: ReglaComercio[] = [
  { patron: /claro/, comercio: { nombre: 'Claro', modo: 'siVacio' } },
  { patron: /movistar/, comercio: { nombre: 'Movistar', modo: 'siVacio' } },
  { patron: /personal/, comercio: { nombre: 'Personal', modo: 'siVacio' } },
  { patron: /fibertel/, comercio: { nombre: 'Fibertel', modo: 'siVacio' } },
  { patron: /telecentro/, comercio: { nombre: 'Telecentro', modo: 'siVacio' } },
  { patron: /tuenti/, comercio: { nombre: 'Tuenti', modo: 'siVacio' } },
];

const PATRON_GYM =
  /(gimnas|gym|smartfit|megatlon|levelgym|level gym|sportclub|planet fitness|fit\s*club|gympass)/;

const REGLAS_GYM: ReglaComercio[] = [
  { patron: /smartfit/, comercio: { nombre: 'Smartfit', modo: 'siVacio' } },
  { patron: /megatlon/, comercio: { nombre: 'Megatlon', modo: 'siVacio' } },
  { patron: /levelgym|level gym/, comercio: { nombre: 'LevelGym', modo: 'siVacio' } },
  { patron: /sportclub/, comercio: { nombre: 'SportClub', modo: 'siVacio' } },
  { patron: /planet fitness/, comercio: { nombre: 'Planet Fitness', modo: 'siVacio' } },
];

const PATRON_COMBUSTIBLE =
  /(nafta|combust|gasoil|diesel|ypf|shell|axion|esso|puma|estacion\s*de\s*serv)/;

const REGLAS_COMBUSTIBLE: ReglaComercio[] = [
  { patron: /ypf/, comercio: { nombre: 'YPF', modo: 'siVacio' } },
  { patron: /shell/, comercio: { nombre: 'Shell', modo: 'siVacio' } },
  { patron: /axion/, comercio: { nombre: 'Axion', modo: 'siVacio' } },
  { patron: /esso/, comercio: { nombre: 'Esso', modo: 'siVacio' } },
  { patron: /puma/, comercio: { nombre: 'Puma', modo: 'siVacio' } },
];

const PATRON_SUPERMERCADO =
  /(supermerc|coto|carrefour|dia\b|jumbo|disco|vea|atb|makro|chango|autoserv|panader|confiter|verduler|kiosco|almacen|mercado)/;

const PATRON_RESTAURANTE =
  /(restaurante|pizzeria|pizza|mcdonald|burger king|mostaza|wendys|starbucks|cafe|cafeter)/;

const PATRON_FARMACIA_VISION = /(farmac|droger|optica|dentist|clinica|laborat)/;

// --- Patrones de re-afirmación para texto (sin visión) -----------------------

const PATRON_COMBUSTIBLE_TEXTO =
  /(nafta|combust|gasoil|diesel|ypf|shell|axion|esso|puma)/;

const PATRON_ALIMENTO_TEXTO =
  /(supermerc|coto|carrefour|dia\b|jumbo|disco|vea|atb|makro|chango|autoserv|panader|confiter|verduler|kiosco|almacen|restaurante|pizza|mcdonald|burger|mostaza|cafe|cafeter)/;

const PATRON_RESTAURANTE_TEXTO =
  /(restaurante|pizza|mcdonald|burger|mostaza|starbucks)/;

const PATRON_FARMACIA_TEXTO = /(farmac|droger|optica)/;

const PATRON_STREAMING_TEXTO =
  /\bspotify\b|\bnetflix\b|\bdisney\b|\bprime\b|\bhbo\b|\bparamount\b|\bstar\+|\byoutube\s*premium\b|\bapple\s*music\b|\bicloud\b|\bgoogle\s*one\b|\bcrunchyroll\b|\bdazn\b|\bflow\b|\bdirectv\b/;

const PATRON_TELECOM_TEXTO = /(claro|movistar|personal|fibertel|telecentro|tuenti)/;

const PATRON_GYM_TEXTO =
  /(gimnas|gym|smartfit|megatlon|levelgym|sportclub|planet fitness)/;

// --- Utilidades --------------------------------------------------------------

function buscar(
  categorias: string[],
  predicado: PredicadoCategoria,
): string | null {
  return (
    categorias.find((categoria) => predicado(categoria.toLowerCase())) ?? null
  );
}

/** Prueba las familias en orden de prioridad. */
function elegirPorFamilias(
  categorias: string[],
  familias: Familia[],
): string | null {
  for (const familia of familias) {
    const encontrada = buscar(categorias, FAMILIAS[familia]);
    if (encontrada) return encontrada;
  }
  return null;
}

/** Como `elegirPorFamilias`, pero cae en la primera categoría disponible. */
function elegirCategoria(
  categorias: string[],
  familias: Familia[],
): string | null {
  return elegirPorFamilias(categorias, familias) ?? categorias[0] ?? null;
}

function aplicarComercio(
  data: RespuestaIA['data'],
  regla: ReglaComercio | undefined,
): void {
  if (!regla?.comercio) return;
  const { nombre, modo } = regla.comercio;
  if (modo === 'siempre' || !data.merchant) {
    data.merchant = nombre;
  }
}

function reglaQueCoincide<T extends ReglaComercio>(
  texto: string,
  reglas: T[],
): T | undefined {
  return reglas.find((regla) => regla.patron.test(texto));
}

// --- Visión ------------------------------------------------------------------

/**
 * En visión se ignora por completo la categoría impresa en el ticket:
 * la categoría se infiere únicamente desde el comercio/marca.
 */
function normalizarVision(
  parsed: RespuestaIA,
  categorias: string[],
  texto: string,
): RespuestaIA {
  const streaming = reglaQueCoincide(texto, REGLAS_STREAMING);
  if (streaming) {
    aplicarComercio(parsed.data, streaming);
    parsed.data.category = elegirCategoria(categorias, streaming.familias);
    return parsed;
  }

  if (PATRON_STREAMING_SECUNDARIO.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, ['ocio', 'varios']);
    aplicarComercio(
      parsed.data,
      reglaQueCoincide(texto, REGLAS_STREAMING_SECUNDARIAS),
    );
    return parsed;
  }

  if (PATRON_TELECOM.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, [
      'servicios',
      'suscripcionTecnologia',
      'varios',
    ]);
    aplicarComercio(parsed.data, reglaQueCoincide(texto, REGLAS_TELECOM));
    return parsed;
  }

  if (PATRON_GYM.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, [
      'otrosVarios',
      'salud',
      'varios',
    ]);
    aplicarComercio(parsed.data, reglaQueCoincide(texto, REGLAS_GYM));
    return parsed;
  }

  if (PATRON_COMBUSTIBLE.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, ['transporte']);
    aplicarComercio(parsed.data, reglaQueCoincide(texto, REGLAS_COMBUSTIBLE));
    return parsed;
  }

  if (PATRON_SUPERMERCADO.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, [
      'alimentacionExacta',
      'alimentacion',
      'restaurante',
      'varios',
    ]);
    return parsed;
  }

  if (PATRON_RESTAURANTE.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, [
      'restaurante',
      'alimentacion',
      'varios',
    ]);
    return parsed;
  }

  if (PATRON_FARMACIA_VISION.test(texto)) {
    parsed.data.category = elegirCategoria(categorias, ['salud', 'varios']);
    return parsed;
  }

  const porNombre =
    categorias.find((categoria) => texto.includes(categoria.toLowerCase())) ??
    null;
  if (porNombre) {
    parsed.data.category = porNombre;
    return parsed;
  }

  parsed.data.category = elegirCategoria(categorias, ['otrosVarios', 'varios']);
  return parsed;
}

// --- Texto -------------------------------------------------------------------

function resolverExactaOFuzzy(
  categorias: string[],
  categoria: string,
): string | null {
  const buscada = categoria.toLowerCase();
  const exacta =
    categorias.find((c) => c.toLowerCase() === buscada) ?? null;
  if (exacta) return exacta;

  return (
    categorias.find((c) => {
      const actual = c.toLowerCase();
      return actual.includes(buscada) || buscada.includes(actual);
    }) ?? null
  );
}

/** Re-afirma la categoría según patrones conocidos del comercio. */
function reafirmarPorComercio(
  categorias: string[],
  texto: string,
  actual: string | null,
): string | null {
  const conRespaldo = (familias: Familia[]) =>
    elegirPorFamilias(categorias, familias) || actual || categorias[0] || null;

  if (PATRON_COMBUSTIBLE_TEXTO.test(texto)) {
    return conRespaldo(['transporte']);
  }

  if (PATRON_ALIMENTO_TEXTO.test(texto)) {
    return PATRON_RESTAURANTE_TEXTO.test(texto)
      ? conRespaldo(['restaurante', 'alimentacion'])
      : conRespaldo(['alimentacion', 'restaurante']);
  }

  if (PATRON_FARMACIA_TEXTO.test(texto)) {
    return conRespaldo(['salud']);
  }

  if (PATRON_STREAMING_TEXTO.test(texto)) {
    return conRespaldo(['ocio']);
  }

  if (PATRON_TELECOM_TEXTO.test(texto)) {
    return conRespaldo(['serviciosTelecom']);
  }

  if (PATRON_GYM_TEXTO.test(texto)) {
    return conRespaldo(['gymPreferida']);
  }

  return actual;
}

function normalizarCategoriaEscrita(
  parsed: RespuestaIA,
  categorias: string[],
  texto: string,
): RespuestaIA {
  const categoria = String(parsed.data.category);
  const resuelta = resolverExactaOFuzzy(categorias, categoria);
  const actual = resuelta ?? categoria;

  const reafirmada = reafirmarPorComercio(categorias, texto, actual);
  const enLista =
    categorias.find(
      (c) => c.toLowerCase() === String(reafirmada).toLowerCase(),
    ) ?? null;

  parsed.data.category = enLista ?? elegirCategoria(categorias, ['varios', 'otrosVarios']);
  return parsed;
}

function normalizarCategoriaDeFiltro(
  parsed: RespuestaIA,
  categorias: string[],
  categoria: string,
): RespuestaIA {
  const resuelta = resolverExactaOFuzzy(categorias, categoria);
  if (resuelta) {
    parsed.data.category = resuelta;
  }
  return parsed;
}

// --- API pública -------------------------------------------------------------

/**
 * Ajusta `data.category` y `data.merchant` para que sean coherentes con la lista
 * real de categorías de api-gastos.
 */
export function normalizarCategoria(
  parsed: RespuestaIA,
  opciones: OpcionesNormalizacion,
): RespuestaIA {
  const { categorias, esVision } = opciones;

  if (categorias.length === 0) {
    return parsed;
  }

  const texto = (
    parsed.data.merchant ||
    parsed.data.description ||
    ''
  ).toLowerCase();

  if (esVision && parsed.intent === 'CREATE_EXPENSE') {
    return normalizarVision(parsed, categorias, texto);
  }

  if (parsed.data.category && INTENCIONES_QUE_ESCRIBEN.has(parsed.intent)) {
    return normalizarCategoriaEscrita(parsed, categorias, texto);
  }

  if (parsed.data.category && INTENCIONES_DE_FILTRO.has(parsed.intent)) {
    return normalizarCategoriaDeFiltro(parsed, categorias, parsed.data.category);
  }

  if (parsed.intent === 'CREATE_EXPENSE') {
    parsed.data.category = elegirCategoria(categorias, ['varios', 'otrosVarios']);
  }

  return parsed;
}

export interface OpcionesInferenciaCategoria {
  comercio: string;
  descripcion?: string | null;
  categorias: string[];
}

export interface CategoriaInferida {
  categoria: string | null;
  comercio: string;
}

/**
 * Infiere la categoría de un comercio/texto libre aplicando las reglas de
 * visión (ignora cualquier categoría impresa). Se usa en
 * `POST /normalizar-categoria`.
 */
export function inferirCategoriaPorComercio({
  comercio,
  descripcion,
  categorias,
}: OpcionesInferenciaCategoria): CategoriaInferida {
  if (categorias.length === 0) {
    return { categoria: null, comercio };
  }

  const parsed = crearRespuestaVacia('CREATE_EXPENSE');
  parsed.data.merchant = comercio;
  parsed.data.description = descripcion ?? null;

  const texto = `${comercio} ${descripcion ?? ''}`.toLowerCase();
  normalizarVision(parsed, categorias, texto);

  return {
    categoria: parsed.data.category,
    comercio: parsed.data.merchant ?? comercio,
  };
}
