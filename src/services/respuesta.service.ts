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
    campos: null,
  },
};

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
    return RESPUESTA_VACIA;
  }

  if (!esObjeto(payload)) {
    return RESPUESTA_VACIA;
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
      campos: comoObjeto(data.campos),
      recurringHint: comoTexto((data as Record<string, unknown>).recurringHint),
    },
  };
}
