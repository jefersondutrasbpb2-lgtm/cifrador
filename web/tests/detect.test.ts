import { describe, expect, it } from 'vitest';
import { detectChords } from '../src/audio/detect';

/** Sintetiza acordes com harmônicos e ataque a cada meio segundo. */
function synth(prog: number[][], dur: number, sr: number) {
  const x = new Float32Array(Math.round(sr * dur * prog.length));
  prog.forEach((notes, r) => {
    for (let i = 0; i < sr * dur; i++) {
      const t = i / sr, env = Math.exp(-3 * (t % 0.5));
      let s = 0;
      for (const m of notes) {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t) / (h * h);
      }
      x[r * sr * dur + i] = s * env * 0.1;
    }
  });
  return x;
}

describe('detectChords', () => {
  it('reconhece G D Em C e o tom de G', () => {
    const G = [43, 59, 62, 67], D = [38, 57, 62, 66], Em = [40, 59, 64, 67], C = [36, 60, 64, 67];
    const res = detectChords(synth([G, D, Em, C, G, D, Em, C], 2, 11025), 11025);
    expect(res.segments.filter((s) => !s.none).map((s) => s.label)).toEqual(['G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C']);
    expect(res.key).toEqual({ tonic: 7, minor: false });
    expect(Math.abs(res.segments[1].start - 2)).toBeLessThan(0.3);
  });
  it('reconhece tom menor', () => {
    const Am = [45, 60, 64, 69], F = [41, 60, 65, 69], E = [40, 59, 64, 68];
    const res = detectChords(synth([Am, F, E, Am], 2, 11025), 11025);
    expect(res.segments.filter((s) => !s.none).map((s) => s.label)).toEqual(['Am', 'F', 'E', 'Am']);
    expect(res.key.minor).toBe(true);
  });
});
