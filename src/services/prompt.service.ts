/**
 * Construcción del prompt de sistema que se envía al modelo de IA.
 * Se aísla del cliente para poder probar el armado sin llamar a la red.
 */

export interface OpcionesPrompt {
  vision: boolean;
  categorias: string[];
  /** Fecha y hora actual en ISO 8601 para interpretar expresiones relativas. */
  fechaActual?: string;
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
  "intent": "CREATE_EXPENSE" | "GET_SUMMARY" | "CREATE_CATEGORY" | "SUGGEST_RECURRING" | "SET_RECURRING" | "DELETE_EXPENSE" | "EDIT_EXPENSE" | "UNKNOWN",
  "data": {
    "total": number | null,
    "merchant": string | null,
    "category": string | null,
    "description": string | null,
    "date": "YYYY-MM-DD" | null,
    "range": "WEEK" | "15_DAYS" | "MONTH" | "2_MONTHS" | "YEAR" | null,
    "frecuencia": "diaria" | "semanal" | "mensual" | "anual" | null,
    "dia": number | null,
    "searchHint": "ultimo" | null,
    "campos": { "monto"?: number, "comercio"?: string, "categoria"?: string, "descripcion"?: string, "fecha"?: string } | null
  }
}`;

const REGLAS_INTENCIONES = `REGLAS PARA "intent":
- CREATE_EXPENSE: el usuario registra un gasto.
- GET_SUMMARY: el usuario pide un resumen o total de gastos.
- CREATE_CATEGORY: el usuario pide crear una categoría nueva.
- SUGGEST_RECURRING: el usuario quiere marcar un gasto como recurrente o pregunta sobre ello.
- SET_RECURRING: el usuario responde con frecuencia/día para configurar recurrencia.
- DELETE_EXPENSE: el usuario quiere eliminar/borrar/sacar un gasto. Si dice "elimina el último gasto de X" pon merchant=X y searchHint="ultimo". Si solo dice "el último gasto" sin comercio, merchant=null y searchHint="ultimo".
- EDIT_EXPENSE: el usuario quiere modificar/cambiar/corregir un gasto ya registrado. Extrae qué gasto buscar (merchant + searchHint="ultimo") y qué campos cambiar en "campos".
- UNKNOWN: no se puede determinar la intención.`;

const REGLAS_COMERCIOS = `NORMALIZACIÓN DE COMERCIOS:
- Escribí siempre el nombre formal de la marca cuando puedas identificarla.
- Ejemplos: "mac" o "mcdonalds" -> "McDonald's"; "coto" -> "Coto"; "meli" -> "Mercado Libre"; "ypf" -> "YPF".
- Si no reconocés la marca, conservá el nombre tal como lo escribió el usuario.`;

const REGLAS_COHERENCIA_COMERCIO_CATEGORIA = `COHERENCIA ENTRE COMERCIO Y CATEGORÍA:
- Si se indica, corrige o deduce el comercio (merchant), DEBES inferir la categoría más adecuada de la lista permitida para ese tipo de comercio.
- Si el usuario corrige el comercio con frases como "no era en X sino en Y", "era en X, ahora es Y" o "el comercio es Y", ACTUALIZÁ también la categoría para que sea coherente con el NUEVO comercio.
- Conocimiento de comercios argentinos: Kiosco/Shop de YPF/Shell/Axion/Esso -> Usualmente Alimentación (snacks/bebidas/cigarrillos) a menos que sea explícitamente "nafta/carga combustible" -> Transporte. Si dice "kiosco de YPF" priorizá Alimentación. Supermercados/hipermercados -> Alimentación. Estaciones de servicio SOLO cuando el gasto es de combustible/nafta/gasoil -> Transporte. Farmacias -> Salud. Gimnasios/clases -> la categoría más lógica de la lista. Restaurantes/fast food/pizzerías -> Alimentación. Transporte/taxis/remises/colectivo/subte -> Transporte. Panaderías/confiterías -> Alimentación.
- Si el usuario especificó EXPLÍCITAMENTE una categoría distinta y es VÁLIDA para la lista, respetala ÚNICAMENTE si es coherente con el nuevo comercio. Si resulta ilógica, priorizá la coherencia con el comercio corregido.
- Nunca inventes categorías fuera de la lista permitida.`;

function reglasFecha(fechaActual: string): string {
  return `CONTEXTO TEMPORAL:
- La fecha y hora actual es ${fechaActual}.
- Convertí expresiones relativas ("hoy", "ayer", "hace 3 días", "el lunes pasado") a una fecha "YYYY-MM-DD" usando ese contexto.
- En CREATE_EXPENSE, devolvé la fecha detectada en "date". Si no se menciona una fecha, devolvé null para que se use la fecha actual.
- En GET_SUMMARY usá "range": WEEK (semana actual), 15_DAYS (últimos 15 días), MONTH (mes actual), 2_MONTHS (últimos 2 meses) o YEAR (año actual). Si no se pide un rango, devolvé null.
- Los campos "date" y "range" que no correspondan a la intención deben ser null.`;
}

function reglasCategorias(listaCategorias: string): string {
  return `REGLAS ESTRICTAS PARA "category":
- DEBES seleccionar obligatoriamente una opción de esta lista de categorías permitidas: [${listaCategorias}].
- Si el gasto no encaja perfectamente en ninguna, asigna "Varios" (o la categoría más cercana de la lista).
- Si no puedes identificar la categoría, devuelve null.
- Para CREATE_CATEGORY, usá "category" con el nombre de la categoría solicitada.`;
}

/**
 * Arma el prompt con la fecha actual y las categorías reales de api-gastos.
 * Si la API no devuelve categorías, usa una lista de respaldo.
 */
export function construirPromptSistema({
  vision,
  categorias,
  fechaActual = new Date().toISOString(),
}: OpcionesPrompt): string {
  const listaCategorias =
    categorias.length > 0 ? categorias.join(', ') : CATEGORIAS_POR_DEFECTO;
  const instruccion = vision ? INSTRUCCION_VISION : INSTRUCCION_TEXTO;

  return [
    instruccion,
    'Responde ÚNICAMENTE en formato JSON estricto sin bloques Markdown.',
    `Estructura requerida:\n${ESTRUCTURA_RESPUESTA}`,
    reglasFecha(fechaActual),
    REGLAS_INTENCIONES,
    reglasCategorias(listaCategorias),
    REGLAS_COMERCIOS,
    REGLAS_COHERENCIA_COMERCIO_CATEGORIA,
  ].join('\n\n');
}
