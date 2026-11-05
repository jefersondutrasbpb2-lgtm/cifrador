import { describe, expect, it } from 'vitest';
import { classifyChordLine, expandInline, layoutChordLine, parseSheet, transposeText } from '../src/music/sheet';
import { SAMPLE } from '../src/sample';

describe('parseSheet', () => {
  it('separa linhas de acorde, letra e seções', () => {
    const s = parseSheet('[Intro]\nG  D  (x2)\n\nG          D\nO café na mesa');
    expect(s.lines.map((l) => l.kind)).toEqual(['sec', 'chords', 'blank', 'chords', 'lyr']);
  });
  it('lê metadados ChordPro', () => {
    const s = parseSheet(SAMPLE);
    expect(s.meta).toEqual({ title: 'Varanda de Domingo', artist: 'Exemplo do Cifrador', key: 'G' });
  });
  it('não confunde letra com acordes', () => {
    expect(classifyChordLine('Em cada canto da casa')).toBeNull();
    expect(classifyChordLine('A casa é sua')).toBeNull();
    expect(classifyChordLine('Intro: C | G | Am | F |')).not.toBeNull();
    expect(classifyChordLine('E|---0---2---|')).toBeNull(); // tablatura fica como texto
  });
  it('mantém o parêntese que faz parte do acorde', () => {
    const t = classifyChordLine('D7(9)  (Am7(b5))')!.filter((x) => x.ch);
    expect(t.map((x) => x.core)).toEqual(['D7(9)', 'Am7(b5)']);
    expect(t[1].pre + '|' + t[1].post).toBe('(|)');
  });
});

describe('ChordPro inline', () => {
  it('converte em acordes acima da letra', () => {
    expect(expandInline('[G]O café na [D]mesa')).toEqual(['G         D', 'O café na mesa']);
    expect(expandInline('[Refrão]')).toBeNull();
  });
});

describe('alinhamento ao transpor', () => {
  it('mantém a coluna do acorde e abre espaço quando cresce', () => {
    const toks = classifyChordLine('G   D   Em')!;
    expect(layoutChordLine(toks, 0, false).map((p) => p.text).join('')).toBe('G   D   Em');
    expect(layoutChordLine(toks, 1, false).map((p) => p.text).join('')).toBe('G#  D#  Fm');
    expect(layoutChordLine(classifyChordLine('C D')!, 1, false).map((p) => p.text).join('')).toBe('C# D#');
  });
  it('transpõe o texto todo sem mexer na letra', () => {
    const out = transposeText('{key: G}\nG    D\nO café\n[G]Lá [C]vem', 2, false);
    expect(out).toBe('{key: A}\nA    E\nO café\n[A]Lá [D]vem');
  });
});
