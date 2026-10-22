import OpenAI from 'openai';
import { Ollama } from 'ollama';
import { GastosApiService } from './gastos-api.service.js';

// Instancias de SDKs
let openrouterClient: OpenAI | null = null;
let ollamaClient: Ollama | null = null;

export interface RespuestaIA {
  intent: string;
  data: {
    total: number | null;
    merchant: string | null;
    category: string | null;
    description: string | null;
  };
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
    ollamaClient = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });
  }
  return ollamaClient;
}

/**
 * Convierte el contenido devuelto por el modelo en la estructura normalizada.
 */
function parsearRespuesta(contenido: string | null | undefined): RespuestaIA {
  let payload: any = {};

  try {
    payload = JSON.parse(contenido || '{}');
  } catch {
    payload = {};
  }

  const data = payload?.data ?? {};

  return {
    intent: typeof payload?.intent === 'string' ? payload.intent : 'UNKNOWN',
    data: {
      total: data.total === null || data.total === undefined ? null : Number(data.total),
      merchant: typeof data.merchant === 'string' ? data.merchant : null,
      category: typeof data.category === 'string' ? data.category : null,
      description: typeof data.description === 'string' ? data.description : null,
    },
  };
}

// Helper para construir el Prompt del sistema con las categorías reales de api-gastos
async function getSystemPrompt(isVision: boolean = false) {
  const categories = await GastosApiService.getCategories();
  const categoryList = categories.length > 0
    ? categories.join(', ')
    : 'Alimentación, Transporte, Servicios, Hogar, Salud, Entretenimiento, Varios';

  const baseInstruction = isVision
    ? 'Eres un sistema de OCR y visión por computadora especializado en extraer datos de tickets y recibos.'
    : 'Eres un asistente financiero especializado en estructurar gastos e intenciones.';

  return `${baseInstruction}
Responde ÚNICAMENTE en formato JSON estricto sin bloques Markdown (\`\`\`json).

Estructura requerida:
{
  "intent": "CREATE_EXPENSE" | "GET_SUMMARY" | "DELETE_EXPENSE" | "UNKNOWN",
  "data": {
    "total": number | null,
    "merchant": string | null,
    "category": string | null,
    "description": string | null
  }
}

REGLAS EStrictas PARA "category":
- DEBES seleccionar obligatoriamente una opción de esta lista de categorías permitidas: [${categoryList}].
- Si el gasto no encaja perfectamente en ninguna, asigna "Varios" (o la categoría más cercana de la lista).
- Si no puedes identificar la categoría, devuelve null.`;
}

// 1. Parseo de mensajes de texto
export async function parseNaturalLanguageText(message: string): Promise<RespuestaIA> {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  const systemPrompt = await getSystemPrompt(false);

  if (provider === 'openrouter') {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });
    return parsearRespuesta(response.choices[0]?.message?.content);
  } else {
    const client = getOllamaClient();
    const response = await client.chat({
      model: process.env.OLLAMA_MODEL || 'llama3.2-vision',
      format: 'json',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });
    return parsearRespuesta(response.message.content);
  }
}

// 2. Procesamiento de comprobantes / fotos
export async function processReceiptImage(imageBuffer: Buffer): Promise<RespuestaIA> {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  const systemPrompt = await getSystemPrompt(true);

  if (provider === 'openrouter') {
    const client = getOpenAIClient();
    const base64Image = imageBuffer.toString('base64');
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrae la información de este ticket de compra.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
    });
    return parsearRespuesta(response.choices[0]?.message?.content);
  } else {
    const client = getOllamaClient();
    const response = await client.chat({
      model: process.env.OLLAMA_MODEL || 'llama3.2-vision',
      format: 'json',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'Extrae la información de este ticket de compra.',
          images: [imageBuffer.toString('base64')],
        },
      ],
    });
    return parsearRespuesta(response.message.content);
  }
}
