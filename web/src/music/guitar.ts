/** Gera posições de violão (afinação padrão) para qualquer acorde. */
import { mod12 } from './theory';

export const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export type Fret = number | 'x';
export interface Voicing { frets: Fret[]; score: number; barre: number }

const cache = new Map<string, Voicing[]>();

export function guitarVoicings(root: number, iv: number[], bassIn: number | null = null): Voicing[] {
  const bass = bassIn ?? root;
  const ck = `${root}|${iv.join(',')}|${bass}`;
  const hit = cache.get(ck);
  if (hit) return hit;

  const pcs = iv.map((i) => mod12(root + i));
  const allowed = new Set([...pcs, bass]);
  const fifthPc = mod12(root + 7);
  // notas que não podem faltar mesmo na tentativa mais relaxada
  const core = new Set([root, bass]);
  for (const i of iv) {
    if ([2, 3, 4, 5, 8, 9, 10, 11].includes(i) || (i === 6 && iv.includes(3) && !iv.includes(4))) core.add(mod12(root + i));
  }
  if (iv.length <= 2) pcs.forEach((p) => core.add(p));
  const full = new Set(pcs.filter((p) => p !== fifthPc || iv.length <= 2));
  full.add(bass);

  let out: Voicing[] = [];
  for (const at of [{ req: full, minPlay: 4 }, { req: core, minPlay: 4 }, { req: core, minPlay: 3 }]) {
    const found = new Map<string, Voicing>();
    const fr: Fret[] = new Array(6);
    for (let b = 0; b <= 9; b++) {
      const cands = b === 0 ? [0, 1, 2, 3] : [b, b + 1, b + 2, b + 3];
      if (b > 0 && b <= 4) cands.unshift(0);
      const opts: Fret[][] = TUNING.map((t) => ['x', ...cands.filter((f) => allowed.has((t + f) % 12))]);
      const rec = (s: number) => {
        if (s < 6) { for (const o of opts[s]) { fr[s] = o; rec(s + 1); } return; }
        let first = -1, last = -1;
        for (let i = 0; i < 6; i++) if (fr[i] !== 'x') { if (first < 0) first = i; last = i; }
        if (first < 0) return;
        for (let i = first; i <= last; i++) if (fr[i] === 'x') return; // sem cordas abafadas no meio
        const played = last - first + 1;
        if (played < at.minPlay) return;
        const f = fr as number[];
        if ((TUNING[first] + f[first]) % 12 !== bass) return;
        const have = new Set<number>();
        const fretted: number[] = [];
        let opens = 0;
        for (let i = first; i <= last; i++) {
          have.add((TUNING[i] + f[i]) % 12);
          if (f[i] > 0) fretted.push(i); else opens++;
        }
        for (const r of at.req) if (!have.has(r)) return;
        let minF = 0, maxF = 0, barre = false, fingers = 0, inside = 0;
        if (fretted.length) {
          minF = Math.min(...fretted.map((i) => f[i]));
          maxF = Math.max(...fretted.map((i) => f[i]));
          if (maxF - minF > 3) return;
          fingers = fretted.length;
          if (fingers > 4) {
            const atMin = fretted.filter((i) => f[i] === minF);
            if (atMin.length >= 2) {
              barre = true;
              for (let i = atMin[0]; i <= atMin[atMin.length - 1]; i++) if (f[i] < minF) barre = false;
            }
            if (barre) fingers = 1 + fretted.filter((i) => f[i] > minF).length;
          }
          if (fingers > 4) return;
          for (let i = first + 1; i <= last; i++) if (f[i] === 0 && fretted.some((j) => j < i)) inside++;
        }
        const score = minF * 0.9 + fingers * 0.5 + (6 - played) * 1.0 + (maxF - minF) * 0.3
          + (maxF >= 4 ? inside * 0.9 : 0)
          + (have.has(fifthPc) || !pcs.includes(fifthPc) ? 0 : 0.7)
          + (barre ? 0.8 : 0) + (opens && minF > 3 ? 0.6 : 0);
        const key = fr.join(',');
        const prev = found.get(key);
        if (!prev || prev.score > score) found.set(key, { frets: fr.slice(), score, barre: barre ? minF : 0 });
      };
      rec(0);
    }
    out = [...found.values()].sort((a, b) => a.score - b.score);
    if (out.length) break;
  }
  const res = out.slice(0, 6);
  cache.set(ck, res);
  return res;
}

/** Custo médio de tocar uma lista de acordes (menor = mais fácil). */
export function difficulty(chords: { root: number; iv: number[]; bass: number | null }[], shift: number): number {
  if (!chords.length) return 0;
  let s = 0;
  for (const c of chords) {
    const v = guitarVoicings(mod12(c.root + shift), c.iv, c.bass == null ? null : mod12(c.bass + shift));
    s += v.length ? v[0].score : 12;
  }
  return s / chords.length;
}

/** Sugere a casa do capotraste que deixa as formas mais fáceis (0–7). */
export function suggestCapo(chords: { root: number; iv: number[]; bass: number | null }[], semis: number, current: number): number | null {
  if (!chords.length) return null;
  let best = current, bc = difficulty(chords, semis - current);
  for (let c = 0; c <= 7; c++) {
    const v = difficulty(chords, semis - c);
    if (v < bc - 0.35) { bc = v; best = c; }
  }
  return best;
}
