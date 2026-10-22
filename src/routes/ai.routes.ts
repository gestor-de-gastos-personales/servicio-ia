import type { FastifyInstance } from 'fastify';
import { parseNaturalLanguageText, processReceiptImage } from '../services/ai.service.js';

export async function aiRoutes(fastify: FastifyInstance) {
  // Endpoint de salud: útil para verificar que el servicio está levantado.
  fastify.get('/health', async () => ({
    status: 'ok',
    servicio: 'servicio-ia',
    timestamp: new Date().toISOString(),
  }));

  // Endpoint para procesar mensajes de texto plano desde Telegram
  fastify.post('/analizar', async (request, reply) => {
    const { texto } = request.body as { texto?: string };

    if (!texto || typeof texto !== 'string' || texto.trim() === '') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'El campo "texto" es requerido y no puede estar vacío.',
      });
    }

    try {
      const aiResult = await parseNaturalLanguageText(texto);

      // Desestructuración y aplanado de datos para bot-telegram
      return {
        intent: aiResult.intent || 'UNKNOWN',
        monto: aiResult.data.total,
        comercio: aiResult.data.merchant,
        categoria: aiResult.data.category,
        descripcion: aiResult.data.description,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error.message || 'Error interno al procesar la solicitud con el modelo de IA.',
      });
    }
  });

  // Endpoint opcional para analizar imágenes de tickets/comprobantes
  fastify.post('/analizar-imagen', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Se requiere adjuntar un archivo de imagen.',
        });
      }

      const buffer = await data.toBuffer();
      const aiResult = await processReceiptImage(buffer);

      return {
        intent: aiResult.intent || 'CREATE_EXPENSE',
        monto: aiResult.data.total,
        comercio: aiResult.data.merchant,
        categoria: aiResult.data.category,
        descripcion: aiResult.data.description,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error.message || 'Error al procesar la imagen del comprobante.',
      });
    }
  });
}
