import { describe, expect, it } from 'vitest';
import { construirPromptSistema } from './prompt.service.js';

describe('construirPromptSistema', () => {
  it('incluye las categorías reales de api-gastos', () => {
    const prompt = construirPromptSistema({
      vision: false,
      categorias: ['Alimentación', 'Transporte', 'Ocio'],
    });

    expect(prompt).toContain('[Alimentación, Transporte, Ocio]');
    expect(prompt).toContain('asistente financiero');
    expect(prompt).toContain('Responde ÚNICAMENTE en formato JSON estricto');
    expect(prompt).toContain('"intent"');
  });

  it('usa la lista de respaldo cuando no hay categorías', () => {
    const prompt = construirPromptSistema({ vision: false, categorias: [] });

    expect(prompt).toContain(
      '[Alimentación, Transporte, Servicios, Hogar, Salud, Entretenimiento, Varios]',
    );
  });

  it('usa la instrucción de visión para comprobantes', () => {
    const prompt = construirPromptSistema({
      vision: true,
      categorias: ['Varios'],
    });

    expect(prompt).toContain('OCR y visión por computadora');
    expect(prompt).not.toContain('asistente financiero');
  });

  it('exige elegir una categoría permitida o null', () => {
    const prompt = construirPromptSistema({
      vision: false,
      categorias: ['Varios'],
    });

    expect(prompt).toContain('obligatoriamente');
    expect(prompt).toContain('devuelve null');
  });
});
