/**
 * Normalización de la respuesta del modelo de IA.
 * El contenido llega como texto libre y puede no ser JSON válido.
 */

export type RangoResumen =
  | 'WEEK'
  | '15_DAYS'
  | 'MONTH'
  | '2_MONTHS'
  | 'YEAR';

export interface RespuestaIA {
  intent: string;
  data: {
    total: number | null;
    merchant: string | null;
    category: string | null;
    description: string | null;
    date: string | null;
    range: RangoResumen | null;
    frecuencia?: string | null;
    dia?: number | null;
    searchHint?: string | null;
    target?: 'last' | 'by_commerce' | string | null;
    campo?: 'monto' | 'comercio' | 'categoria' | 'descripcion' | 'fecha' | string | null;
    valor?: number | string | null;
    query?: string | null;
    campos?: Record<string, unknown> | null;
    recurringHint?: string | null;
  };
}

const RANGOS_VALIDOS: RangoResumen[] = [
  'WEEK',
  '15_DAYS',
  'MONTH',
  '2_MONTHS',
  'YEAR',
];

const RESPUESTA_VACIA: RespuestaIA = {
  intent: 'UNKNOWN',
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
  },
};

/** Devuelve una respuesta vacía nueva (evita compartir estado mutable). */
export function crearRespuestaVacia(intent = 'UNKNOWN'): RespuestaIA {
  return {
    ...RESPUESTA_VACIA,
    intent,
    data: { ...RESPUESTA_VACIA.data },
  };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function comoTexto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

function comoNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return esObjeto(valor) ? valor : null;
}

function comoEntero(valor: unknown): number | null {
  const numero = comoNumero(valor);
  if (numero === null) return null;
  return Number.isInteger(numero) ? numero : null;
}

/** Acepta número o texto; descarta cualquier otro tipo. */
function comoNumeroOTexto(valor: unknown): number | string | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  return typeof valor === 'string' ? valor : null;
}

/** Acepta únicamente fechas ISO de calendario (YYYY-MM-DD). */
function comoFecha(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;

  const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const fechaValida = !Number.isNaN(Date.parse(valor));
  return formatoValido && fechaValida ? valor : null;
}

function comoRango(valor: unknown): RangoResumen | null {
  return typeof valor === 'string' &&
    RANGOS_VALIDOS.includes(valor as RangoResumen)
    ? (valor as RangoResumen)
    : null;
}

/**
 * Convierte el contenido devuelto por el modelo en la estructura normalizada.
 */
export function parsearRespuesta(contenido: string | null | undefined): RespuestaIA {
  let payload: unknown;

  try {
    payload = JSON.parse(contenido || '{}');
  } catch {
    return crearRespuestaVacia();
  }

  if (!esObjeto(payload)) {
    return crearRespuestaVacia();
  }

  const data = esObjeto(payload.data) ? payload.data : {};

  return {
    intent: typeof payload.intent === 'string' ? payload.intent : 'UNKNOWN',
    data: {
      total: comoNumero(data.total),
      merchant: comoTexto(data.merchant),
      category: comoTexto(data.category),
      description: comoTexto(data.description),
      date: comoFecha(data.date),
      range: comoRango(data.range),
      frecuencia: comoTexto(data.frecuencia),
      dia: comoEntero(data.dia),
      searchHint: comoTexto(data.searchHint),
      target: comoTexto(data.target),
      campo: comoTexto(data.campo),
      valor: comoNumeroOTexto(data.valor),
      query: comoTexto(data.query),
      campos: comoObjeto(data.campos),
      recurringHint: comoTexto(data.recurringHint),
    },
  };
}

export interface ResultadoValidacion {
  /** `true` si el contenido es JSON con `intent` textual y `data` objeto. */
  valida: boolean;
  /** Respuesta normalizada (aunque `valida` sea `false`). */
  respuesta: RespuestaIA;
}

/**
 * Valida el JSON crudo devuelto por el modelo. Se usa en `POST /validar-respuesta`
 * para depurar respuestas antes de consumirlas en el bot.
 */
export function validarRespuesta(contenido: string): ResultadoValidacion {
  const respuesta = parsearRespuesta(contenido);

  let payload: unknown;
  try {
    payload = JSON.parse(contenido);
  } catch {
    return { valida: false, respuesta };
  }

  const valida =
    esObjeto(payload) &&
    typeof payload.intent === 'string' &&
    esObjeto(payload.data);

  return { valida, respuesta };
}
