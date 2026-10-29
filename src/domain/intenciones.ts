/**
 * Catálogo único de intenciones que el prompt puede devolver.
 * Se expone por `GET /intents` y alimenta la estructura del prompt para
 * mantener el contrato en un solo lugar.
 */
export const INTENCIONES_SOPORTADAS = [
  'CREATE_EXPENSE',
  'GET_SUMMARY',
  'CREATE_CATEGORY',
  'SUGGEST_RECURRING',
  'SET_RECURRING',
  'DELETE_EXPENSE',
  'EDIT_EXPENSE',
  'SHOW_EXPENSE',
  'UPDATE_EXPENSE',
  'UNKNOWN',
] as const;

export type IntencionSoportada = (typeof INTENCIONES_SOPORTADAS)[number];

/** Representación `"A" | "B" | ...` para incrustar en el prompt. */
export function intencionesComoUnion(): string {
  return INTENCIONES_SOPORTADAS.map((intencion) => `"${intencion}"`).join(
    ' | ',
  );
}
