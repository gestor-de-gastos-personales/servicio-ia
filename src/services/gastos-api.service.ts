import 'dotenv/config';

/**
 * Lee la URL base de api-gastos en tiempo de ejecución (no al cargar el módulo)
 * para respetar el orden de carga de dotenv.
 */
function getApiGastosUrl(): string {
  return (process.env.API_GASTOS_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

export class GastosApiService {
  /**
   * Persiste un gasto (endpoint protegido por JWT).
   */
  static async createExpense(payload: unknown) {
    const response = await fetch(`${getApiGastosUrl()}/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.json();
  }

  /**
   * Obtiene el resumen de gastos de un usuario de Telegram.
   */
  static async getSummary(telegramId: string) {
    const response = await fetch(
      `${getApiGastosUrl()}/gastos/resumen/bot?telegramId=${encodeURIComponent(telegramId)}`,
    );
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.json();
  }

  /**
   * Devuelve los nombres de las categorías vigentes de api-gastos.
   * Ante cualquier error devuelve un array vacío para no frenar el análisis.
   */
  static async getCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${getApiGastosUrl()}/categorias`);
      if (!response.ok) return [];

      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];

      return data
        .map((cat) => (cat as { nombre?: string }).nombre)
        .filter((nombre): nombre is string => typeof nombre === 'string');
    } catch {
      return [];
    }
  }
}
