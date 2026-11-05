import { describe, expect, it } from 'vitest';
import { guitarVoicings, suggestCapo } from '../src/music/guitar';
import { parseChord } from '../src/music/theory';

const first = (s: string) => { const c = parseChord(s)!; return guitarVoicings(c.root, c.iv, c.bass)[0].frets.join(''); };

describe('posições de violão', () => {
  it('acha as formas abertas que todo mundo toca', () => {
    expect(first('C')).toBe('x32010');
    expect(first('G')).toBe('320003');
    expect(first('D')).toBe('xx0232');
    expect(first('Am')).toBe('x02210');
    expect(first('Em')).toBe('022000');
    expect(first('E')).toBe('022100');
    expect(first('D/F#')).toBe('200232');
  });
  it('usa pestana quando precisa', () => {
    expect(first('F')).toBe('133211');
    expect(first('Bm')).toBe('x24432');
  });
  it('sugere capo para tons difíceis', () => {
    // Bb Gm Eb F com capo 3 vira G Em C D
    const chs = ['Bb', 'Gm', 'Eb', 'F'].map((c) => parseChord(c)!);
    expect(suggestCapo(chs, 0, 0)).toBe(3);
  });
});
