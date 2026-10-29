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

/** Body de POST /analizar-lote: entre 1 y 20 textos. */
export const esquemaAnalizarLote: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['textos'],
    properties: {
      textos: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
        },
      },
    },
  },
};

/** Body de POST /normalizar-categoria. */
export const esquemaNormalizarCategoria: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['comercio'],
    properties: {
      comercio: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      descripcion: {
        type: 'string',
        maxLength: 500,
      },
    },
  },
};

/** Body de POST /validar-respuesta. */
export const esquemaValidarRespuesta: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['contenido'],
    properties: {
      contenido: {
        type: 'string',
        minLength: 1,
        maxLength: 20000,
      },
    },
  },
};
