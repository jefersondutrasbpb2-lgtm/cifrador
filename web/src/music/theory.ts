/** Teoria básica: notas, leitura de acordes (inclui notação brasileira) e tonalidade. */

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (n: number) => ((n % 12) + 12) % 12;
export const noteName = (pc: number, flats = false) => (flats ? NOTES_FLAT : NOTES_SHARP)[mod12(pc)];

export function notePc(n: string): number {
  let p = PC[n[0]];
  if (n[1] === '#') p++;
  else if (n[1] === 'b') p--;
  return mod12(p);
}

export interface Chord {
  /** classe de altura da fundamental (0 = C) */
  root: number;
  /** sufixo como foi escrito (ex.: "m7(b5)") — preservado ao transpor */
  q: string;
  /** baixo invertido (D/F# → 6) ou null */
  bass: number | null;
  /** intervalos em semitons a partir da fundamental, sem repetição */
  iv: number[];
  minor: boolean;
  dim: boolean;
}

interface Fx { third?: number; fifth?: number; ext?: number[]; sev?: boolean; maj7?: boolean; power?: boolean }

// Ordem importa: tokens mais longos primeiro.
const QTOK: [string, Fx][] = [
  ['maj7', { maj7: true }], ['maj9', { maj7: true, ext: [14] }], ['7M', { maj7: true }], ['M7', { maj7: true }],
  ['7+', { maj7: true }], ['maj', { maj7: true }], ['Δ', { maj7: true }],
  ['sus2', { third: 2 }], ['sus4', { third: 5 }], ['sus', { third: 5 }],
  ['add9', { ext: [14] }], ['add2', { ext: [14] }], ['add11', { ext: [17] }], ['add4', { ext: [17] }],
  ['b13', { ext: [20] }], ['-13', { ext: [20] }], ['#11', { ext: [18] }], ['+11', { ext: [18] }],
  ['b9', { ext: [13] }], ['-9', { ext: [13] }], ['#9', { ext: [15] }], ['+9', { ext: [15] }],
  ['b5', { fifth: 6 }], ['-5', { fifth: 6 }], ['#5', { fifth: 8 }], ['+5', { fifth: 8 }],
  ['13', { ext: [21] }], ['11', { ext: [17] }], ['9', { ext: [14] }], ['7', { sev: true }],
  ['6', { ext: [9] }], ['5', { power: true }], ['4', { third: 5 }], ['2', { ext: [14] }], ['+', { fifth: 8 }],
];

export function parseQuality(q: string): { iv: number[]; minor: boolean; dim: boolean } | null {
  let s = q.replace(/[()\s,]/g, '');
  let third = 4, fifth = 7, seventh: number | null = null, power = false, dim = false;
  const ext: number[] = [];
  if (s.startsWith('min')) { third = 3; s = s.slice(3); }
  else if (/^m(?!aj)/.test(s)) { third = 3; s = s.slice(1); }
  else if (/^(dim|°|º)/.test(s)) { third = 3; fifth = 6; dim = true; s = s.replace(/^(dim|°|º)/, ''); }
  else if (s.startsWith('aug')) { fifth = 8; s = s.slice(3); }
  else if (s.startsWith('ø')) { third = 3; fifth = 6; seventh = 10; s = s.slice(1); }
  while (s.length) {
    const hit = QTOK.find(([t]) => s.startsWith(t));
    if (!hit) return null;
    const fx = hit[1];
    if (fx.third != null) third = fx.third;
    if (fx.fifth != null) fifth = fx.fifth;
    if (fx.ext) ext.push(...fx.ext);
    if (fx.sev) seventh = dim ? 9 : 10;
    if (fx.maj7) seventh = 11;
    if (fx.power) power = true;
    s = s.slice(hit[0].length);
  }
  const iv = [0];
  if (!power) iv.push(third);
  iv.push(fifth);
  if (seventh != null) iv.push(seventh);
  for (const e of ext) iv.push(e % 12);
  return { iv: [...new Set(iv.map(mod12))], minor: third === 3 && !dim, dim };
}

/** Lê um acorde ("G", "Am7(b5)", "D/F#", "C7/9", "B°"). Devolve null se não for acorde. */
export function parseChord(tok: string): Chord | null {
  if (!tok) return null;
  const t = tok.replace(/\/(?=[\d#+\-]|b\d)/g, ''); // "C7/9" = C7(9)
  const m = t.match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!m) return null;
  const pq = parseQuality(m[3]);
  if (!pq) return null;
  return { root: notePc(m[1] + m[2]), q: m[3], bass: m[4] ? notePc(m[4]) : null, ...pq };
}

export function chordName(ch: Chord, shift = 0, flats = false): string {
  return noteName(ch.root + shift, flats) + ch.q + (ch.bass != null ? '/' + noteName(ch.bass + shift, flats) : '');
}

export function transposeChord(name: string, shift: number, flats = false): string {
  const ch = parseChord(name);
  return ch ? chordName(ch, shift, flats) : name;
}

/* ---------- Tonalidade ---------- */

export interface Key { tonic: number; minor: boolean }

const FLAT_MAJ = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MIN = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

export function keyPrefersFlats(k: Key | null): boolean {
  return k ? (k.minor ? FLAT_MIN : FLAT_MAJ).has(mod12(k.tonic)) : false;
}

/** Acordes diatônicos (tríades) de uma tonalidade. */
export function diatonic(tonic: number, minor: boolean): { maj: number[]; min: number[] } {
  const t = minor ? mod12(tonic + 3) : tonic;
  return { maj: [t, mod12(t + 5), mod12(t + 7)], min: [mod12(t + 2), mod12(t + 4), mod12(t + 9)] };
}

export function estimateKeyFromChords(chs: Chord[]): Key | null {
  if (!chs.length) return null;
  let best: (Key & { s: number }) | null = null;
  for (let t = 0; t < 12; t++) {
    for (const minor of [false, true]) {
      const d = diatonic(t, minor);
      let s = 0;
      chs.forEach((c, i) => {
        const inKey = c.minor ? d.min.includes(c.root) : !c.dim && d.maj.includes(c.root);
        if (inKey) s += 1;
        if (c.root === t && c.minor === minor) s += i === 0 || i === chs.length - 1 ? 1.5 : 0.5;
        if (minor && c.root === mod12(t + 7) && !c.minor) s += 0.4; // dominante maior no tom menor
      });
      if (!best || s > best.s) best = { tonic: t, minor, s };
    }
  }
  return best && { tonic: best.tonic, minor: best.minor };
}

export function parseKeyName(k: string | undefined): Key | null {
  const c = parseChord((k || '').trim());
  return c ? { tonic: c.root, minor: c.minor } : null;
}

export const keyLabel = (k: Key | null, flats = keyPrefersFlats(k)) =>
  k ? noteName(k.tonic, flats) + (k.minor ? 'm' : '') : '?';
