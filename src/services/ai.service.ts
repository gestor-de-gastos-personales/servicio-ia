import OpenAI from 'openai';
import { Ollama } from 'ollama';
import { GastosApiService } from './gastos-api.service.js';
import { construirPromptSistema } from './prompt.service.js';
import { parsearRespuesta } from './respuesta.service.js';
import type { RespuestaIA } from './respuesta.service.js';

type ProveedorIA = 'openrouter' | 'ollama';

interface SolicitudIA {
  promptSistema: string;
  mensaje: string;
  imagen?: Buffer;
}

const INSTRUCCION_IMAGEN = 'Extrae la información de este ticket de compra.';

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
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
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

async function consultarOpenRouter(
  solicitud: SolicitudIA,
): Promise<string | null | undefined> {
  const esVision = solicitud.imagen !== undefined;

  const response = await getOpenAIClient().chat.completions.create({
    model: esVision
      ? process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini'
      : process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: solicitud.promptSistema },
      { role: 'user', content: contenidoUsuario(solicitud) },
    ],
  });

  return response.choices[0]?.message?.content;
}

async function consultarOllama(
  solicitud: SolicitudIA,
): Promise<string | null | undefined> {
  const response = await getOllamaClient().chat({
    model: process.env.OLLAMA_MODEL || 'llama3.2-vision',
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

  return parsearRespuesta(contenido);
}

async function promptConCategorias(vision: boolean): Promise<string> {
  const categorias = await GastosApiService.getCategories();
  return construirPromptSistema({
    vision,
    categorias,
    fechaActual: new Date().toISOString(),
  });
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
    mensaje: INSTRUCCION_IMAGEN,
    imagen: imageBuffer,
  });
}
