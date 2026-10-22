import 'dotenv/config';

/**
 * Lee la URL base de api-gastos en tiempo de ejecución (no al cargar el módulo)
 * para respetar el orden de carga de dotenv.
 */
function getApiGastosUrl(): string {
  return (process.env.API_GASTOS_URL || 'http://127.0.0.1:3000').replace(
    /\/+$/,
    '',
  );
}

export interface GastoCreado {
  id: number;
  descripcion: string;
  monto: number;
}

export interface ResumenGastos {
  totalGeneral: number;
  porCategoria: Array<{
    categoriaNombre: string;
    total: number;
    porcentaje: number;
  }>;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`api-gastos respondió ${response.status} en ${url}`);
  }

  return (await response.json()) as T;
}

export class GastosApiService {
  /** Persiste un gasto (endpoint protegido por JWT). */
  static async createExpense(payload: unknown): Promise<GastoCreado> {
    return pedir<GastoCreado>(`${getApiGastosUrl()}/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /** Obtiene el resumen de gastos de un usuario de Telegram. */
  static async getSummary(telegramId: string): Promise<ResumenGastos> {
    return pedir<ResumenGastos>(
      `${getApiGastosUrl()}/gastos/resumen/bot?telegramId=${encodeURIComponent(telegramId)}`,
    );
  }

  /**
   * Devuelve los nombres de las categorías vigentes de api-gastos.
   * Ante cualquier error devuelve un array vacío para no frenar el análisis.
   */
  static async getCategories(): Promise<string[]> {
    try {
      const data: unknown = await pedir<unknown>(
        `${getApiGastosUrl()}/categorias`,
      );

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .map((categoria) => (categoria as { nombre?: string }).nombre)
        .filter((nombre): nombre is string => typeof nombre === 'string');
    } catch {
      return [];
    }
  }
}
