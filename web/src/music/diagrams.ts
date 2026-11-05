/** Desenhos SVG: braço do violão e teclado. Cores vêm das variáveis CSS. */
import { TUNING, type Voicing } from './guitar';

export function guitarSVG(v: Voicing, rootPc: number): string {
  const fr = v.frets;
  const fretted = fr.filter((f): f is number => f !== 'x' && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const start = maxF <= 4 ? 1 : minF;
  const X = (i: number) => 16 + i * 14, Y = (k: number) => 30 + k * 17;
  let s = `<svg class="dsvg" width="96" height="124" viewBox="0 0 100 128" role="img" aria-label="Posição ${fr.join(' ')}">`;
  for (let k = 0; k <= 5; k++) s += `<line class="${k === 0 && start === 1 ? 'nut' : 'fr'}" x1="${X(0)}" y1="${Y(k)}" x2="${X(5)}" y2="${Y(k)}"/>`;
  for (let i = 0; i < 6; i++) s += `<line class="str" x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(5)}"/>`;
  if (start > 1) s += `<text x="2" y="${Y(0) + 12}">${start}</text>`;
  if (v.barre) {
    const idx = fr.map((f, i) => (f === v.barre ? i : -1)).filter((i) => i >= 0);
    const a = idx[0], b = idx[idx.length - 1], y = Y(v.barre - start) + 8.5;
    s += `<rect class="barre" x="${X(a) - 5}" y="${y - 5}" width="${X(b) - X(a) + 10}" height="10" rx="5"/>`;
  }
  fr.forEach((f, i) => {
    const x = X(i);
    if (f === 'x') { s += `<path class="mk" d="M${x - 3.5} 14l7 7M${x + 3.5} 14l-7 7"/>`; return; }
    if (f === 0) { s += `<circle class="mk" cx="${x}" cy="17.5" r="3.6"/>`; return; }
    if (v.barre && f === v.barre) return;
    const pc = (TUNING[i] + f) % 12;
    s += `<circle class="dot${pc === rootPc ? ' root' : ''}" cx="${x}" cy="${Y(f - start) + 8.5}" r="5.4"/>`;
  });
  return s + '</svg>';
}

/** Dois oitavas: baixo na primeira, acorde em posição fechada na segunda. */
export function keysSVG(root: number, iv: number[], bass: number | null): string {
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
  const on = new Set<number>();
  const b = bass ?? root;
  for (const i of [...iv].sort((x, y) => x - y)) { let n = 12 + root + i; if (n > 23) n -= 12; on.add(n); }
  const ww = 11, h = 62;
  let s = `<svg class="dsvg kb" width="160" height="70" viewBox="0 0 ${14 * ww + 2} ${h + 4}" role="img" aria-label="Teclado">`;
  for (let o = 0; o < 2; o++) whites.forEach((pc, wi) => {
    const n = o * 12 + pc, cls = on.has(n) ? 'w on' : o === 0 && pc === b ? 'w bs' : 'w';
    s += `<rect class="${cls}" x="${1 + (o * 7 + wi) * ww}" y="1" width="${ww}" height="${h}" rx="1.5"/>`;
  });
  for (let o = 0; o < 2; o++) blacks.forEach(([pc, after]) => {
    const n = o * 12 + pc, cls = on.has(n) ? 'on' : o === 0 && pc === b ? 'bs' : 'b';
    s += `<rect class="${cls}" x="${1 + (o * 7 + after + 1) * ww - 3.6}" y="1" width="7.2" height="${h * 0.6}" rx="1"/>`;
  });
  return s + '</svg>';
}
