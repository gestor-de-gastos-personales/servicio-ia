import { FastifyInstance } from 'fastify';
import { parseNaturalLanguageText, processTicketImage } from '../services/ai.service';

export async function aiRoutes(fastify: FastifyInstance) {
  // 1. Mensajes de texto
  fastify.post('/parse-message', async (request, reply) => {
    const { message, telegramId } = request.body as { message?: string; telegramId?: string };

    if (!message) {
      return reply.status(400).send({ success: false, message: 'El campo "message" es obligatorio.' });
    }

    try {
      const parsedData = await parseNaturalLanguageText(message);
      return reply.send({
        success: true,
        provider: process.env.AI_PROVIDER || 'openrouter',
        data: parsedData,
      });
    } catch (error: any) {
      console.error('❌ Error en /parse-message:', error.message);
      return reply.status(503).send({
        success: false,
        message: 'El servicio de IA no se encuentra disponible temporalmente.',
        error: error.message,
      });
    }
  });

  // 2. Procesamiento de tickets en imagen
  fastify.post('/process-ticket', async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ success: false, message: 'No se envió ninguna imagen.' });
      }

      const buffer = await data.toBuffer();
      const imageBase64 = buffer.toString('base64');

      const parsedTicket = await processTicketImage(imageBase64);

      return reply.send({
        success: true,
        provider: process.env.AI_PROVIDER || 'openrouter',
        data: parsedTicket,
      });
    } catch (error: any) {
      console.error('❌ Error en /process-ticket:', error.message);
      return reply.status(503).send({
        success: false,
        message: 'No se pudo procesar la imagen del ticket.',
        error: error.message,
      });
    }
  });
}