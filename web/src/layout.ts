/** Cálculos de tamanho da cifra na tela. */

export const MIN_SIZE = 10;
export const MAX_SIZE = 44;

export const clampSize = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)));

/**
 * Maior tamanho de letra (px) em que a linha mais longa cabe na largura.
 * @param maxChars  quantidade de caracteres da linha mais longa
 * @param width     largura disponível em px (de uma coluna)
 * @param ratio     largura de 1 caractere ÷ tamanho da letra (fonte monoespaçada ≈ 0,6)
 */
export function fitFontSize(maxChars: number, width: number, ratio: number): number {
  if (maxChars <= 0 || width <= 0 || ratio <= 0) return clampSize(17);
  return clampSize(Math.floor(width / (maxChars * ratio)));
}

/** Largura de cada coluna, descontando o espaço entre elas. */
export const columnWidth = (total: number, cols: number, gap: number) => (total - gap * (cols - 1)) / cols;

/** Distância entre dois dedos (gesto de pinça). */
export const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
