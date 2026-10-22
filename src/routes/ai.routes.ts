import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  parseNaturalLanguageText,
  processReceiptImage,
} from '../services/ai.service.js';
import type { RespuestaIA } from '../services/respuesta.service.js';
import { esquemaAnalizarTexto } from './ai.schemas.js';

interface CuerpoTexto {
  texto: string;
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
  };
}

export async function aiRoutes(fastify: FastifyInstance) {
  // Endpoint de salud: útil para verificar que el servicio está levantado.
  fastify.get('/health', async () => ({
    status: 'ok',
    servicio: 'servicio-ia',
    timestamp: new Date().toISOString(),
  }));

  // Procesa mensajes de texto plano enviados desde Telegram.
  fastify.post<{ Body: CuerpoTexto }>(
    '/analizar',
    { schema: esquemaAnalizarTexto },
    async (request) => {
      const resultado = await parseNaturalLanguageText(request.body.texto);
      return respuestaGasto(resultado, 'UNKNOWN');
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
}
