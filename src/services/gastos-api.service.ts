const API_GASTOS_URL = process.env.API_GASTOS_URL || 'http://127.0.0.1:3000/api';

export class GastosApiService {
  static async createExpense(payload: {
    total: number;
    merchant?: string;
    category?: string;
    description?: string;
    telegramId?: string;
  }) {
    try {
      const response = await fetch(`${API_GASTOS_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`api-gastos devolvió status ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('❌ Error conectando con api-gastos:', error.message);
      throw new Error('No se pudo conectar con el servicio de gastos.');
    }
  }

  static async getSummary(telegramId: string) {
    try {
      const response = await fetch(`${API_GASTOS_URL}/expenses/summary?telegramId=${telegramId}`);
      if (!response.ok) {
        throw new Error(`api-gastos devolvió status ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error('❌ Error obteniendo resumen:', error.message);
      throw new Error('No se pudo obtener el resumen de gastos.');
    }
  }
}