import type { FastifySchema } from 'fastify';

/**
 * Body estricto de POST /analizar: solo se acepta `texto` y no puede venir vacío.
 */
export const esquemaAnalizarTexto: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['texto'],
    properties: {
      texto: {
        type: 'string',
        minLength: 1,
        maxLength: 2000,
      },
    },
  },
};
