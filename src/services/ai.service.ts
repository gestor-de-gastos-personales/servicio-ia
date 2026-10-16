import OpenAI from 'openai';
import { Ollama } from 'ollama';

function getOpenAIClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Falta OPENROUTER_API_KEY en las variables de entorno.');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:8000',
      'X-Title': 'Mangos Expense AI',
    },
  });
}

function getOllamaClient() {
  return new Ollama({
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  });
}

const SYSTEM_PROMPT_NLU = `
Eres un asistente financiero inteligente. Analiza el mensaje del usuario y responde ÚNICAMENTE en formato JSON válido sin bloques Markdown.

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

Reglas:
1. "CREATE_EXPENSE": Si menciona haber gastado dinero o realizado una compra.
2. "GET_SUMMARY": Si pide ver su saldo, resumen o total de gastos.
3. "DELETE_EXPENSE": Si indica eliminar o borrar un gasto.
4. "UNKNOWN": Cualquier otra interacción.
`;

export async function parseNaturalLanguageText(message: string) {
  const provider = process.env.AI_PROVIDER || 'openrouter';

  if (provider === 'openrouter') {
    const openrouter = getOpenAIClient();
    const response = await openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_NLU },
        { role: 'user', content: message },
      ],
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } else {
    const ollama = getOllamaClient();
    const response = await ollama.chat({
      model: process.env.OLLAMA_MODEL || 'llama3.2-vision',
      format: 'json',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_NLU },
        { role: 'user', content: message },
      ],
    });

    return JSON.parse(response.message.content);
  }
}

export async function processTicketImage(imageBase64: string) {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  const promptText = `Analiza la imagen de este ticket de compra. Extrae la información relevante y responde ÚNICAMENTE en formato JSON válido sin Markdown con la estructura:
  {
    "intent": "CREATE_EXPENSE",
    "data": {
      "total": number,
      "merchant": string,
      "category": string,
      "description": string
    }
  }`;

  if (provider === 'openrouter') {
    const openrouter = getOpenAIClient();
    const visionModel = process.env.OPENROUTER_VISION_MODEL || 'google/gemini-flash-1.5';

    const response = await openrouter.chat.completions.create({
      model: visionModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } else {
    const ollama = getOllamaClient();
    const response = await ollama.chat({
      model: process.env.OLLAMA_MODEL || 'llama3.2-vision',
      format: 'json',
      messages: [
        {
          role: 'user',
          content: promptText,
          images: [imageBase64],
        },
      ],
    });

    return JSON.parse(response.message.content);
  }
}