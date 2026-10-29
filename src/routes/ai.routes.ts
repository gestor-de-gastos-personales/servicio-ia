import type { FastifyInstance, FastifyReply } from 'fastify';
import { obtenerVersion } from '../config/version.js';
import { INTENCIONES_SOPORTADAS } from '../domain/intenciones.js';
import {
  parseNaturalLanguageText,
  parsearLote,
  processReceiptImage,
} from '../services/ai.service.js';
import { inferirCategoriaPorComercio } from '../services/categoria.service.js';
import { obtenerCategorias } from '../services/categorias.service.js';
import { GastosApiService } from '../services/gastos-api.service.js';
import { validarRespuesta } from '../services/respuesta.service.js';
import type { RespuestaIA } from '../services/respuesta.service.js';
import {
  esquemaAnalizarLote,
  esquemaAnalizarTexto,
  esquemaNormalizarCategoria,
  esquemaValidarRespuesta,
} from './ai.schemas.js';

interface CuerpoTexto {
  texto: string;
}

interface CuerpoLote {
  textos: string[];
}

interface CuerpoNormalizarCategoria {
  comercio: string;
  descripcion?: string;
}

interface CuerpoValidarRespuesta {
  contenido: string;
}

type EstadoError = 400 | 415;

function responderError(
  reply: FastifyReply,
  statusCode: EstadoError,
  message: string,
) {
  return reply.status(statusCode).send({
    statusCode,
    error: statusCode === 400 ? 'Bad Request' : 'Unsupported Media Type',
    message,
  });
}

/** Aplana la respuesta de la IA al contrato que consume el bot. */
function respuestaGasto(resultado: RespuestaIA, intentPorDefecto: string) {
  return {
    intent: resultado.intent || intentPorDefecto,
    monto: resultado.data.total,
    comercio: resultado.data.merchant,
    categoria: resultado.data.category,
    descripcion: resultado.data.description,
    fecha: resultado.data.date,
    rango: resultado.data.range,
  };
}

function proveedorActivo(): 'openrouter' | 'ollama' {
  return process.env.AI_PROVIDER === 'ollama' ? 'ollama' : 'openrouter';
}

export async function aiRoutes(fastify: FastifyInstance) {
  // Endpoint de salud: útil para verificar que el servicio está levantado.
  fastify.get('/health', async () => ({
    status: 'ok',
    servicio: 'servicio-ia',
    timestamp: new Date().toISOString(),
  }));

  // Readiness: además de estar vivo, verifica que api-gastos responda.
  fastify.get('/ready', async (_request, reply) => {
    const apiGastos = await GastosApiService.estaDisponible();
    return reply.status(apiGastos ? 200 : 503).send({
      status: apiGastos ? 'ok' : 'degraded',
      servicio: 'servicio-ia',
      apiGastos,
      timestamp: new Date().toISOString(),
    });
  });

  // Versión desplegada y proveedor de IA activo.
  fastify.get('/version', async () => ({
    servicio: 'servicio-ia',
    version: obtenerVersion(),
    aiProvider: proveedorActivo(),
  }));

  // Catálogo de intenciones que el prompt puede devolver.
  fastify.get('/intents', async () => ({
    intents: INTENCIONES_SOPORTADAS,
    total: INTENCIONES_SOPORTADAS.length,
  }));

  // Categorías reales de api-gastos (con caché corta).
  fastify.get('/categorias', async () => {
    const categorias = await obtenerCategorias();
    return { categorias, total: categorias.length };
  });

  // Procesa mensajes de texto plano enviados desde Telegram.
  fastify.post<{ Body: CuerpoTexto }>(
    '/analizar',
    { schema: esquemaAnalizarTexto },
    async (request) => {
      const resultado = await parseNaturalLanguageText(request.body.texto);
      return respuestaGasto(resultado, 'UNKNOWN');
    },
  );

  // Procesa varios textos en una sola llamada (mantiene el orden de entrada).
  fastify.post<{ Body: CuerpoLote }>(
    '/analizar-lote',
    { schema: esquemaAnalizarLote },
    async (request) => {
      const resultados = await parsearLote(request.body.textos);
      return {
        resultados: resultados.map((resultado) =>
          respuestaGasto(resultado, 'UNKNOWN'),
        ),
      };
    },
  );

  // Procesa la foto de un ticket/comprobante.
  fastify.post('/analizar-imagen', async (request, reply) => {
    if (!request.isMultipart()) {
      return responderError(
        reply,
        415,
        'El cuerpo debe ser multipart/form-data con una imagen.',
      );
    }

    const archivo = await request.file();

    if (!archivo) {
      return responderError(
        reply,
        400,
        'Se requiere adjuntar un archivo de imagen.',
      );
    }

    const buffer = await archivo.toBuffer();

    if (!archivo.mimetype.startsWith('image/')) {
      return responderError(
        reply,
        415,
        'El archivo adjunto debe ser una imagen.',
      );
    }

    if (buffer.length === 0) {
      return responderError(reply, 400, 'La imagen adjunta está vacía.');
    }

    const resultado = await processReceiptImage(buffer);
    return respuestaGasto(resultado, 'CREATE_EXPENSE');
  });

  // Infiere la categoría de un comercio/texto libre usando las reglas de visión.
  fastify.post<{ Body: CuerpoNormalizarCategoria }>(
    '/normalizar-categoria',
    { schema: esquemaNormalizarCategoria },
    async (request) => {
      const categorias = await obtenerCategorias();
      return inferirCategoriaPorComercio({
        comercio: request.body.comercio,
        descripcion: request.body.descripcion ?? null,
        categorias,
      });
    },
  );

  // Parsea y valida el JSON crudo devuelto por un modelo.
  fastify.post<{ Body: CuerpoValidarRespuesta }>(
    '/validar-respuesta',
    { schema: esquemaValidarRespuesta },
    async (request) => validarRespuesta(request.body.contenido),
  );
}
