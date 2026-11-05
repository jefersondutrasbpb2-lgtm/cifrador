import { describe, expect, it } from 'vitest';
import { chordName, estimateKeyFromChords, parseChord, transposeChord } from '../src/music/theory';

const iv = (s: string) => [...parseChord(s)!.iv].sort((a, b) => a - b);

describe('parseChord', () => {
  it('lê tríades e inversões', () => {
    expect(iv('C')).toEqual([0, 4, 7]);
    expect(iv('Am')).toEqual([0, 3, 7]);
    expect(parseChord('D/F#')!.bass).toBe(6);
    expect(iv('B°')).toEqual([0, 3, 6]);
  });
  it('entende a notação brasileira', () => {
    expect(iv('G7M')).toEqual([0, 4, 7, 11]);
    expect(iv('Am7(b5)')).toEqual([0, 3, 6, 10]);
    expect(iv('C7(9)')).toEqual([0, 2, 4, 7, 10]);
    expect(iv('C7/9')).toEqual([0, 2, 4, 7, 10]);
    expect(iv('D4')).toEqual([0, 5, 7]);
    expect(iv('C9')).toEqual([0, 2, 4, 7]); // no Brasil, C9 = add9
    expect(iv('Cm6')).toEqual([0, 3, 7, 9]);
    expect(iv('Cm7M')).toEqual([0, 3, 7, 11]);
  });
  it('rejeita palavras comuns da letra', () => {
    for (const w of ['Do', 'Ela', 'Amor', 'Fé', 'Bem', 'Casa', 'Refrão']) expect(parseChord(w)).toBeNull();
  });
});

describe('transposição', () => {
  it('sobe e desce mantendo o sufixo', () => {
    expect(transposeChord('Am7(b5)', 2)).toBe('Bm7(b5)');
    expect(transposeChord('D/F#', 1, true)).toBe('Eb/G');
    expect(transposeChord('G7M', -7)).toBe('C7M');
    expect(chordName(parseChord('Bb')!, 2)).toBe('C');
  });
});

describe('tonalidade', () => {
  it('acha o tom pelos acordes', () => {
    const k = estimateKeyFromChords(['G', 'D', 'Em', 'C', 'G'].map((c) => parseChord(c)!));
    expect(k).toEqual({ tonic: 7, minor: false });
    const m = estimateKeyFromChords(['Am', 'F', 'C', 'E', 'Am'].map((c) => parseChord(c)!));
    expect(m).toEqual({ tonic: 9, minor: true });
  });
});
