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
  forzarInferirCategoria?: boolean;
}

const INSTRUCCION_IMAGEN = 'Analizá ÚNICAMENTE este ticket/recibo. Extraé monto y comercio/establecimiento. NO asignes categoría basada en texto impreso del ticket. Determiná la categoría SOLO desde el nombre/marca del comercio usando las categorías permitidas.';

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
    max_tokens: esVision ? 768 : 512,
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

  const parsed = parsearRespuesta(contenido);
  // Post-normalize: force category to be from allowed list (vision especially)
  try {
    const categorias = await GastosApiService.getCategories();
    const catLower = (list: string[]) => list.map((c) => String(c).toLowerCase());
    const m = ((parsed.data.merchant || parsed.data.description || '') as string).toLowerCase();
    const esVision = solicitud.imagen !== undefined || solicitud.forzarInferirCategoria;

    function pickByIncludes(keywords: string[], preferIncludes?: string[]) {
      for (const k of keywords) {
        if (!m.includes(k)) continue;
        // Try to find category by preference
        if (preferIncludes && preferIncludes.length) {
          for (const pref of preferIncludes) {
            const found = categorias.find((c) => catLower([c])[0].includes(pref));
            if (found) return found;
          }
        }
        // Generic fallback
        const first = categorias.find((c) => {
          const cl = catLower([c])[0];
          // Prefer common mappings
          if (prefers(cl, keywords)) return true;
          return false;
        });
        if (first) return first;
      }
      return null;
    }

    function prefers(cl: string, keywords: string[]) {
      // Heuristic by keywords
      if (keywords.some((k) => /(nafta|combust|gasoil|diesel|ypf|shell|axion|esso|puma|estacion|combustible)/.test(k))) {
        return cl.includes('transporte');
      }
      if (keywords.some((k) => /(supermerc|coto|carrefour|dia\b|jumbo|disco|vea|atb|makro|chango|autoserv|panader|confiter|verduler|kiosco|almacen|comercio)/.test(k))) {
        return cl.includes('aliment') || cl === 'restaurante';
      }
      if (keywords.some((k) => /(farmac|droger|optica|salud)/.test(k))) {
        return cl.includes('salud') || cl.includes('bienestar');
      }
      if (keywords.some((k) => /(netflix|spotify|disney|prime|amazon prime|hbo|max|paramount|star\+|youtube premium|apple music|icloud|google one|crunchyroll|dazn|flow|directv|movistar play|suscrip)/.test(k))) {
        return cl.includes('entreten') || cl.includes('ocio') || cl.includes('suscrip') || cl.includes('tecnolog');
      }
      if (keywords.some((k) => /(gimnas|gym|smartfit|megatlon|levelgym|sportclub|planet fitness|fit)/.test(k))) {
        return cl === 'otros / varios' || cl.includes('salud') || cl.includes('bienestar') || cl === 'otros' || cl.includes('varios');
      }
      if (keywords.some((k) => /(claro|movistar|personal|fibertel|telecentro|tuenti|cable|internet|telefon|celular|vodafone)/.test(k))) {
        return cl.includes('servic') || cl.includes('factur') || cl.includes('suscrip') || cl.includes('tecnolog');
      }
      return false;
    }

    // For vision ALWAYS infer from merchant/description, ignore ticket category
    if (esVision && parsed.intent === 'CREATE_EXPENSE') {
      // Streaming
      if (/\bspotify\b/.test(m)) {
        parsed.data.merchant = 'Spotify';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias.find((c) => catLower([c])[0] === 'otros / varios') || categorias[0];
        return parsed;
      }
      if (/\bnetflix\b/.test(m)) {
        parsed.data.merchant = 'Netflix';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias.find((c) => catLower([c])[0] === 'otros / varios') || categorias[0];
        return parsed;
      }
      if (/\bdisney\b|\bdisney\+/.test(m)) {
        parsed.data.merchant = 'Disney+';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bamazon\s*prime\b|\bprime\s*video\b/.test(m)) {
        parsed.data.merchant = 'Amazon Prime';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bhbo\b|\bhbo\s*max\b/.test(m)) {
        parsed.data.merchant = 'HBO Max';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bparamount\b|\bparamount\+/.test(m)) {
        parsed.data.merchant = 'Paramount+';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bstar\+\b|\bstar\s*plus\b/.test(m)) {
        parsed.data.merchant = 'Star+';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\byoutube\s*premium\b/.test(m)) {
        parsed.data.merchant = 'YouTube Premium';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bapple\s*music\b/.test(m)) {
        parsed.data.merchant = 'Apple Music';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bicloud\b/.test(m)) {
        parsed.data.merchant = 'iCloud';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/\bgoogle\s*one\b/.test(m)) {
        parsed.data.merchant = 'Google One';
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/(crunchyroll|dazn|flow|directv|star\s*play)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        if (/(crunchyroll)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Crunchyroll';
        if (/(dazn)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'DAZN';
        if (/(flow)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Flow';
        if (/(directv)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'DirecTV';
        return parsed;
      }

      // Telecom
      if (/(claro|movistar|personal|fibertel|telecentro|tuenti|cablevision|cable|internet|telefonia|telefon)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('servic') || catLower([c])[0].includes('factur')) || categorias.find((c) => catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        if (/(claro)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Claro';
        else if (/(movistar)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Movistar';
        else if (/(personal)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Personal';
        else if (/(fibertel)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Fibertel';
        else if (/(telecentro)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Telecentro';
        else if (/(tuenti)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Tuenti';
        return parsed;
      }

      // Gyms
      if (/(gimnas|gym|smartfit|megatlon|levelgym|level gym|sportclub|planet fitness|fit\s*club|gympass)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'otros / varios' || catLower([c])[0] === 'otros') || categorias.find((c) => catLower([c])[0].includes('salud') || catLower([c])[0].includes('bienestar')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        if (/(smartfit)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Smartfit';
        else if (/(megatlon)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Megatlon';
        else if (/(levelgym|level gym)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'LevelGym';
        else if (/(sportclub)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'SportClub';
        else if (/(planet fitness)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Planet Fitness';
        return parsed;
      }

      // Fuel
      if (/(nafta|combust|gasoil|diesel|ypf|shell|axion|esso|puma|estacion\s*de\s*serv)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'transporte') || categorias[0];
        if (/(ypf)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'YPF';
        else if (/(shell)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Shell';
        else if (/(axion)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Axion';
        else if (/(esso)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Esso';
        else if (/(puma)/.test(m)) parsed.data.merchant = parsed.data.merchant || 'Puma';
        return parsed;
      }

      // Supermarkets/restaurants/food
      if (/(supermerc|coto|carrefour|dia\b|jumbo|disco|vea|atb|makro|chango|autoserv|panader|confiter|verduler|kiosco|almacen|mercado)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'alimentación' || catLower([c])[0] === 'alimentacion') || categorias.find((c) => catLower([c])[0].includes('aliment')) || categorias.find((c) => catLower([c])[0] === 'restaurante') || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }
      if (/(restaurante|pizzeria|pizza|mcdonald|burger king|mostaza|wendys|starbucks|cafe|cafeter)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'restaurante') || categorias.find((c) => catLower([c])[0].includes('aliment')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }

      // Pharmacy/health
      if (/(farmac|droger|optica|dentist|clinica|laborat)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('salud') || catLower([c])[0].includes('bienestar')) || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
        return parsed;
      }

      // Try to match by any existing category name in text
      let matched: string | undefined;
      for (const c of categorias) {
        if (m.includes(String(c).toLowerCase())) {
          matched = c;
          break;
        }
      }
      if (matched) {
        parsed.data.category = matched;
        return parsed;
      }
      parsed.data.category = categorias.find((c) => catLower([c])[0] === 'otros / varios') || categorias.find((c) => catLower([c])[0] === 'varios') || categorias.find((c) => catLower([c])[0].includes('varios')) || categorias[0];
      return parsed;
    }

    if (parsed.data.category) {
      const cat = String(parsed.data.category);
      const catLower = (list: string[]) => list.map((c) => String(c).toLowerCase());
      const exacta = categorias.find((c) => catLower([c])[0] === cat.toLowerCase());
      if (exacta) {
        parsed.data.category = exacta;
      } else {
        // Try fuzzy match
        const fuzzy = categorias.find((c) => catLower([c])[0].includes(cat.toLowerCase()) || cat.toLowerCase().includes(catLower([c])[0]));
        if (fuzzy) {
          parsed.data.category = fuzzy;
        }
      }

      // Re-enforce by merchant/description for known patterns
      if (/(nafta|combust|gasoil|diesel|ypf|shell|axion|esso|puma)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'transporte') || parsed.data.category || categorias[0];
      } else if (/(supermerc|coto|carrefour|dia\b|jumbo|disco|vea|atb|makro|chango|autoserv|panader|confiter|verduler|kiosco|almacen|restaurante|pizza|mcdonald|burger|mostaza|cafe|cafeter)/.test(m)) {
        if (/(restaurante|pizza|mcdonald|burger|mostaza|starbucks)/.test(m)) {
          parsed.data.category = categorias.find((c) => catLower([c])[0] === 'restaurante') || categorias.find((c) => catLower([c])[0].includes('aliment')) || parsed.data.category || categorias[0];
        } else {
          parsed.data.category = categorias.find((c) => catLower([c])[0].includes('aliment')) || categorias.find((c) => catLower([c])[0] === 'restaurante') || parsed.data.category || categorias[0];
        }
      } else if (/(farmac|droger|optica)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('salud') || catLower([c])[0].includes('bienestar')) || parsed.data.category || categorias[0];
      } else if (/\bspotify\b|\bnetflix\b|\bdisney\b|\bprime\b|\bhbo\b|\bparamount\b|\bstar\+|\byoutube\s*premium\b|\bapple\s*music\b|\bicloud\b|\bgoogle\s*one\b|\bcrunchyroll\b|\bdazn\b|\bflow\b|\bdirectv\b/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('ocio') || catLower([c])[0].includes('entreten') || catLower([c])[0].includes('suscrip') || catLower([c])[0].includes('tecnolog')) || parsed.data.category || categorias[0];
      } else if (/(claro|movistar|personal|fibertel|telecentro|tuenti)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('servic') || catLower([c])[0].includes('factur') || catLower([c])[0].includes('suscrip')) || parsed.data.category || categorias[0];
      } else if (/(gimnas|gym|smartfit|megatlon|levelgym|sportclub|planet fitness)/.test(m)) {
        parsed.data.category = categorias.find((c) => catLower([c])[0] === 'otros / varios' || catLower([c])[0].includes('varios') || catLower([c])[0].includes('salud') || catLower([c])[0].includes('bienestar')) || parsed.data.category || categorias[0];
      }

      // Ensure it's from allowed list
      const catFinal = String(parsed.data.category);
      const inList = categorias.find((c) => catLower([c])[0] === catFinal.toLowerCase());
      if (!inList) {
        parsed.data.category = categorias.find((c) => catLower([c])[0].includes('varios')) || categorias.find((c) => catLower([c])[0] === 'otros / varios') || categorias[0];
      } else {
        parsed.data.category = inList;
      }
      return parsed;
    }
    if (parsed.intent === 'CREATE_EXPENSE') {
      parsed.data.category = categorias.find((c) => catLower([c])[0].includes('varios')) || categorias.find((c) => catLower([c])[0] === 'otros / varios') || categorias[0];
    }
  } catch {
    // ignore
  }
  return parsed;
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
