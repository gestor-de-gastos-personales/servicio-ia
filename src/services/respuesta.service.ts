/**
 * Normalización de la respuesta del modelo de IA.
 * El contenido llega como texto libre y puede no ser JSON válido.
 */

export interface RespuestaIA {
  intent: string;
  data: {
    total: number | null;
    merchant: string | null;
    category: string | null;
    description: string | null;
  };
}

const RESPUESTA_VACIA: RespuestaIA = {
  intent: 'UNKNOWN',
  data: {
    total: null,
    merchant: null,
    category: null,
    description: null,
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
    },
  };
}
