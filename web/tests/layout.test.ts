import { describe, expect, it } from 'vitest';
import { columnWidth, fitFontSize, MAX_SIZE, MIN_SIZE } from '../src/layout';

describe('ajuste de tamanho', () => {
  it('faz a linha mais longa caber na largura', () => {
    // 40 caracteres em 360 px com fonte de proporção 0,6 → 15 px
    expect(fitFontSize(40, 360, 0.6)).toBe(15);
  });
  it('respeita os limites mínimo e máximo', () => {
    expect(fitFontSize(200, 300, 0.6)).toBe(MIN_SIZE);
    expect(fitFontSize(5, 2000, 0.6)).toBe(MAX_SIZE);
  });
  it('divide a largura entre as colunas', () => {
    expect(columnWidth(1000, 2, 40)).toBe(480);
    expect(columnWidth(1000, 1, 40)).toBe(1000);
  });
});
