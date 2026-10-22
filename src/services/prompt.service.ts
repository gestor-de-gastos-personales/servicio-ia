/**
 * Construcción del prompt de sistema que se envía al modelo de IA.
 * Se aísla del cliente para poder probar el armado sin llamar a la red.
 */

export interface OpcionesPrompt {
  vision: boolean;
  categorias: string[];
}

const CATEGORIAS_POR_DEFECTO = [
  'Alimentación',
  'Transporte',
  'Servicios',
  'Hogar',
  'Salud',
  'Entretenimiento',
  'Varios',
].join(', ');

const INSTRUCCION_TEXTO =
  'Eres un asistente financiero especializado en estructurar gastos e intenciones.';

const INSTRUCCION_VISION =
  'Eres un sistema de OCR y visión por computadora especializado en extraer datos de tickets y recibos.';

const ESTRUCTURA_RESPUESTA = `{
  "intent": "CREATE_EXPENSE" | "GET_SUMMARY" | "DELETE_EXPENSE" | "UNKNOWN",
  "data": {
    "total": number | null,
    "merchant": string | null,
    "category": string | null,
    "description": string | null
  }
}`;

/**
 * Arma el prompt con las categorías reales de api-gastos.
 * Si la API no devuelve categorías, usa una lista de respaldo.
 */
export function construirPromptSistema({
  vision,
  categorias,
}: OpcionesPrompt): string {
  const listaCategorias =
    categorias.length > 0 ? categorias.join(', ') : CATEGORIAS_POR_DEFECTO;
  const instruccion = vision ? INSTRUCCION_VISION : INSTRUCCION_TEXTO;

  return `${instruccion}
Responde ÚNICAMENTE en formato JSON estricto sin bloques Markdown.

Estructura requerida:
${ESTRUCTURA_RESPUESTA}

REGLAS ESTRICTAS PARA "category":
- DEBES seleccionar obligatoriamente una opción de esta lista de categorías permitidas: [${listaCategorias}].
- Si el gasto no encaja perfectamente en ninguna, asigna "Varios" (o la categoría más cercana de la lista).
- Si no puedes identificar la categoría, devuelve null.`;
}
