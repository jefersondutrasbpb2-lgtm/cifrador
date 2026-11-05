/** Leitura de cifras em texto: formato "acordes em cima da letra" e ChordPro. */
import { type Chord, chordName, parseChord } from './theory';

export interface Token { pos: number; raw: string; pre?: string; core?: string; post?: string; ch?: Chord; label?: boolean }
export type Line =
  | { kind: 'blank' }
  | { kind: 'sec'; text: string }
  | { kind: 'lyr'; text: string }
  | { kind: 'chords'; toks: Token[] };
export interface Sheet { meta: { title: string; artist: string; key: string }; lines: Line[] }

const DECOR = /^(\|+:?|:?\|+|\(|\)|\[|\]|x\d+|\d+x|[-–—]+|\/+|%|\.+|\d+:\d{2}|\d+\.|\*+|~+)$/i;
const LABEL = /^([A-Za-zÀ-ÿ0-9ºª]+:|\[[^\]]+\]:?)$/;

function splitTok(t: string) {
  const m = t.match(/^([(\[|]*)(.*?)([)\]|,.;]*)$/)!;
  let core = m[2], post = m[3];
  // "D7(9)": o ")" é do acorde, não pontuação
  while ((core.match(/\(/g) || []).length > (core.match(/\)/g) || []).length && post.startsWith(')')) {
    core += ')';
    post = post.slice(1);
  }
  return { pre: m[1], core, post };
}

/** Se a linha só tem acordes (e marcações como "|", "(x2)", "Intro:"), devolve os tokens. */
export function classifyChordLine(line: string): Token[] | null {
  const toks: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null, chords = 0, i = 0;
  while ((m = re.exec(line))) {
    const raw = m[0];
    const { pre, core, post } = splitTok(raw);
    const ch = core ? parseChord(core) : null;
    if (ch) { chords++; toks.push({ pos: m.index, raw, pre, core, post, ch }); }
    else if (DECOR.test(raw) || DECOR.test(core) || core === '') toks.push({ pos: m.index, raw });
    else if (i === 0 && LABEL.test(raw)) toks.push({ pos: m.index, raw, label: true });
    else return null;
    i++;
  }
  return chords ? toks : null;
}

/** "[G]O café na [D]mesa" → ["G          D", "O café na mesa"] */
export function expandInline(line: string): string[] | null {
  if (!/\[[^\]]+\]/.test(line)) return null;
  const all = [...line.matchAll(/\[([^\]]+)\]/g)];
  if (!all.every((x) => parseChord(x[1].trim()))) return null;
  let last = 0, cl = '', ly = '';
  for (const m of all) {
    ly += line.slice(last, m.index);
    if (cl.length > ly.length) ly = ly.padEnd(cl.length + 1);
    cl = cl.padEnd(ly.length) + m[1].trim();
    last = m.index! + m[0].length;
  }
  ly += line.slice(last);
  return ly.trim() ? [cl, ly] : [cl];
}

export function parseSheet(text: string): Sheet {
  const meta = { title: '', artist: '', key: '' };
  const lines: Line[] = [];
  const push = (raw: string) => {
    if (!raw.trim()) { lines.push({ kind: 'blank' }); return; }
    const sec = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sec && !parseChord(sec[1].trim())) { lines.push({ kind: 'sec', text: sec[1].trim() }); return; }
    const toks = classifyChordLine(raw);
    if (toks) { lines.push({ kind: 'chords', toks }); return; }
    lines.push({ kind: 'lyr', text: raw });
  };
  for (let raw of text.replace(/\r/g, '').split('\n')) {
    raw = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
    const d = raw.match(/^\s*\{\s*([\w_]+)\s*(?::\s*(.*?))?\s*\}\s*$/);
    if (d) {
      const k = d[1].toLowerCase(), v = d[2] || '';
      if (k === 't' || k === 'title') meta.title = v;
      else if (k === 'st' || k === 'subtitle' || k === 'artist') meta.artist = v;
      else if (k === 'key' || k === 'k') meta.key = v;
      else if (k === 'c' || k === 'comment' || k === 'ci') lines.push({ kind: 'sec', text: v });
      else if (k === 'soc' || k === 'start_of_chorus') lines.push({ kind: 'sec', text: v || 'Refrão' });
      continue;
    }
    const inl = expandInline(raw);
    if (inl) inl.forEach(push);
    else push(raw);
  }
  return { meta, lines };
}

export function sheetChords(s: Sheet): Chord[] {
  const out: Chord[] = [];
  for (const l of s.lines) if (l.kind === 'chords') for (const t of l.toks) if (t.ch) out.push(t.ch);
  return out;
}

export interface Part { text: string; chord?: string }

/** Monta uma linha de acordes transposta mantendo as colunas sobre a letra. */
export function layoutChordLine(toks: Token[], shift: number, flats: boolean): Part[] {
  const parts: Part[] = [];
  let cur = 0, prevEnd = 0;
  toks.forEach((t, i) => {
    const name = t.ch ? chordName(t.ch, shift, flats) : '';
    const disp = t.ch ? t.pre! + name + t.post! : t.raw;
    let target = t.pos;
    if (i > 0) target = Math.max(t.pos, t.pos > prevEnd ? cur + 1 : cur);
    if (target > cur) parts.push({ text: ' '.repeat(target - cur) });
    if (t.ch) {
      if (t.pre) parts.push({ text: t.pre });
      parts.push({ text: name, chord: name });
      if (t.post) parts.push({ text: t.post });
    } else parts.push({ text: t.raw });
    cur = target + disp.length;
    prevEnd = t.pos + t.raw.length;
  });
  return parts;
}

/** Reescreve o texto inteiro com os acordes transpostos (letra e ChordPro intactos). */
export function transposeText(text: string, shift: number, flats: boolean): string {
  return text.replace(/\r/g, '').split('\n').map((raw) => {
    if (/^\s*\{/.test(raw)) {
      return raw.replace(/^(\s*\{\s*(?:key|k)\s*:\s*)([^}]+?)(\s*\})$/i, (_, a, k, b) => {
        const ch = parseChord(k.trim());
        return ch ? a + chordName(ch, shift, flats) + b : a + k + b;
      });
    }
    if (expandInline(raw)) {
      return raw.replace(/\[([^\]]+)\]/g, (_, c) => '[' + chordName(parseChord(c.trim())!, shift, flats) + ']');
    }
    const toks = classifyChordLine(raw.replace(/\t/g, '    '));
    return toks ? layoutChordLine(toks, shift, flats).map((p) => p.text).join('') : raw;
  }).join('\n');
}
