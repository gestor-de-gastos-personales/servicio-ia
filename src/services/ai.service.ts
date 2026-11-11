import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { Ollama } from 'ollama';
import { normalizarCategoria } from './categoria.service.js';
import { GastosApiService } from './gastos-api.service.js';
import { construirPromptSistema } from './prompt.service.js';
import { parsearRespuesta } from './respuesta.service.js';
import type { RespuestaIA } from './respuesta.service.js';

type ProveedorIA = 'openrouter' | 'ollama';

interface SolicitudIA {
  promptSistema: string;
  mensaje: string;
  imagen?: Buffer;
  forzarInferirCategoria?: boolean;
}

// Instancias de SDKs (se crean una sola vez por proceso)
let openrouterClient: OpenAI | null = null;
let ollamaClient: Ollama | null = null;

function proveedorActivo(): ProveedorIA {
  return process.env.AI_PROVIDER === 'ollama' ? 'ollama' : 'openrouter';
}

function getOpenAIClient(): OpenAI {
  if (!openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY');
    openrouterClient = new OpenAI({
      // Compatible con OpenRouter y con OpenCode Go (endpoint OpenAI).
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'User-Agent': 'mangos-servicio-ia/1.0',
        'x-opencode-session': `svc-ia-${randomUUID()}`,
      },
    });
  }
  return openrouterClient;
}

function getOllamaClient(): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
  }
  return ollamaClient;
}

function contenidoUsuario(solicitud: SolicitudIA) {
  if (!solicitud.imagen) {
    return solicitud.mensaje;
  }

  return [
    { type: 'text' as const, text: solicitud.mensaje },
    {
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${solicitud.imagen.toString('base64')}`,
      },
    },
  ];
}

/** Errores en los que vale la pena probar el siguiente modelo. */
function errorReintentable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return (
    status === 402 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/** Modelo principal + respaldos configurados, sin repetidos. */
function modelosOpenRouter(esVision: boolean): string[] {
  const principal = esVision
    ? process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini'
    : process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';
  const variable = esVision
    ? process.env.OPENROUTER_VISION_FALLBACK_MODELS
    : process.env.OPENROUTER_FALLBACK_MODELS;

  const respaldos = (variable ?? '')
    .split(',')
    .map((modelo) => modelo.trim())
    .filter(Boolean);

  return [...new Set([principal, ...respaldos])];
}

async function consultarOpenRouter(
  solicitud: SolicitudIA,
): Promise<string | null | undefined> {
  const esVision = solicitud.imagen !== undefined;
  const modelos = modelosOpenRouter(esVision);
  let ultimoError: unknown = null;
  let huboRespuesta = false;
  let huboLimite = false;

  for (const modelo of modelos) {
    try {
      const response = await getOpenAIClient().chat.completions.create({
        model: modelo,
        response_format: { type: 'json_object' },
        max_tokens: esVision ? 768 : 512,
        messages: [
          { role: 'system', content: solicitud.promptSistema },
          { role: 'user', content: contenidoUsuario(solicitud) },
        ],
      });

      const contenido = response.choices[0]?.message?.content;
      if (contenido) return contenido;

      // Un modelo de razonamiento puede gastar todo el presupuesto sin
      // devolver contenido: se intenta con el siguiente de la cadena.
      huboRespuesta = true;
      ultimoError ??= new Error(`El modelo ${modelo} no devolvió contenido`);
    } catch (error) {
      ultimoError = error;
      if (!errorReintentable(error)) throw error;
      huboLimite = true;
    }
  }

  // Si algún modelo respondió (aunque sea vacío) y no hubo límites de por medio
  // se conserva el comportamiento previo: la respuesta se interpreta como
  // UNKNOWN. Si hubo 402/429/5xx, se propaga el error para que el usuario
  // reciba "reintentá" en lugar de "no entendí".
  if (huboRespuesta && !huboLimite) return null;
  throw ultimoError ?? new Error('No hay modelos de OpenRouter disponibles');
}

/** Modelo de Ollama para cada caso: las imágenes usan un modelo con visión. */
function modeloOllama(esVision: boolean): string {
  const texto = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  if (!esVision) return texto;
  return process.env.OLLAMA_VISION_MODEL || texto;
}

async function consultarOllama(
  solicitud: SolicitudIA,
): Promise<string | null | undefined> {
  const response = await getOllamaClient().chat({
    model: modeloOllama(solicitud.imagen !== undefined),
    format: 'json',
    messages: [
      { role: 'system', content: solicitud.promptSistema },
      solicitud.imagen
        ? {
            role: 'user',
            content: solicitud.mensaje,
            images: [solicitud.imagen.toString('base64')],
          }
        : { role: 'user', content: solicitud.mensaje },
    ],
  });

  return response.message.content;
}

async function consultarIA(solicitud: SolicitudIA): Promise<RespuestaIA> {
  const contenido =
    proveedorActivo() === 'ollama'
      ? await consultarOllama(solicitud)
      : await consultarOpenRouter(solicitud);

  const parsed = parsearRespuesta(contenido);

  try {
    const categorias = await GastosApiService.getCategories();
    return normalizarCategoria(parsed, {
      categorias,
      esVision:
        solicitud.imagen !== undefined ||
        Boolean(solicitud.forzarInferirCategoria),
    });
  } catch {
    // La normalización es best-effort: si api-gastos no responde devolvemos
    // la respuesta cruda del modelo.
    return parsed;
  }
}

async function promptConCategorias(vision: boolean): Promise<string> {
  const categorias = await GastosApiService.getCategories();
  const base = construirPromptSistema({
    vision,
    categorias,
    fechaActual: new Date().toISOString(),
  });
  if (!vision) return base;
  const lista = categorias.join(', ');
  return `${base}\n\nREGLA CRÍTICA PARA IMÁGENES/RECIBOS (VISIÓN):\n- CATEGORÍAS PERMITIDAS (ÚNICAS VÁLIDAS): [${lista}]\n- IGNORÁ COMPLETAMENTE CUALQUIER CATEGORÍA IMPRESA EN EL TICKET/RECIBO. NO LA COPIES NI LA USES.\n- Asigna "category" ÚNICAMENTE con uno de los nombres EXACTOS de esa lista.\n- INFERÍ ÚNICAMENTE por COMERCIO/MARCA/RAZÓN SOCIAL: YPF/Shell/Axion/Esso/Puma nafta/combustible -> Transporte. Coto/Carrefour/Dia/Jumbo/Disco/Vea/Atb/Makro/Supermercados -> Alimentación o Restaurante según corresponda. Farmacias/Drogerías/Ópticas -> Salud y Bienestar si existe. Gimnasios (Smartfit/Megatlon/LevelGym/SportClub/Planet Fitness) -> priorizá "Otros / Varios" si está en la lista, sino la más coherente. Suscripciones/streaming (Netflix/Spotify/Disney+/Amazon Prime/YouTube Premium/HBO Max/Paramount+/Star+/Apple Music/iCloud/Google One/Crunchyroll/DAZN/Flow/DirecTV) -> Ocio y Entretenimiento o Suscripciones y Tecnología según lo que exista en la lista. Telefonía/Internet/Cable (Claro/Movistar/Personal/Fibertel/Telecentro/Tuenti) -> Servicios y Facturas si existe.\n- Normalizá marcas con capitalización correcta: Spotify, Netflix, Disney+, Amazon Prime, YouTube Premium, HBO Max, Paramount+, Star+, Apple Music, iCloud, Google One.\n- Si NO hay coincidencia exacta con alguna marca/comercio clara, inferí por el comercio y si no podés determinar con certeza, usá "Otros / Varios" si existe en la lista.\n- NO inventes nombres de categorías.`;
}

/** Parsea un mensaje de texto plano ("Gasté 1500 en el Coto"). */
export async function parseNaturalLanguageText(
  message: string,
): Promise<RespuestaIA> {
  const promptSistema = await promptConCategorias(false);
  return consultarIA({ promptSistema, mensaje: message });
}

/** Analiza la imagen de un comprobante y extrae el gasto. */
export async function processReceiptImage(
  imageBuffer: Buffer,
): Promise<RespuestaIA> {
  const promptSistema = await promptConCategorias(true);
  return consultarIA({
    promptSistema,
    mensaje: 'Extrae ÚNICAMENTE monto, comercio/merchant. NO copies categoría del ticket. Asigna categoría SOLO desde la lista provista.',
    imagen: imageBuffer,
    forzarInferirCategoria: true,
  });
}

/**
 * Analiza varios textos en paralelo. Se usa en `POST /analizar-lote`.
 * El orden del resultado respeta el orden de entrada.
 */
export async function parsearLote(textos: string[]): Promise<RespuestaIA[]> {
  return Promise.all(textos.map((texto) => parseNaturalLanguageText(texto)));
}
