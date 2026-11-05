/**
 * Detecção de acordes no navegador.
 * Espectro (FFT 8192 @ 11025 Hz) → picos → cromagrama de 12 notas → suavização →
 * comparação com 24 modelos (maior/menor) + peso do baixo e do tom → Viterbi.
 */
import { diatonic, keyPrefersFlats, mod12, noteName, type Key } from '../music/theory';

export interface Segment { start: number; end: number; label: string; none?: boolean }
export interface Detection { segments: Segment[]; key: Key; duration: number }
export interface DetectOptions { penalty?: number; sevenths?: boolean }

export function makeFFT(n: number) {
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  for (let i = 0, j = 0; i < n; i++) { rev[i] = j; let bit = n >> 1; while (j & bit) { j ^= bit; bit >>= 1; } j |= bit; }
  return (re: Float32Array, im: Float32Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half, wr = cos[k * step], wi = sin[k * step];
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: ArrayLike<number>, b: ArrayLike<number>) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
  return s / Math.sqrt(sa * sb || 1);
}
function template(root: number, ivs: number[], w: number[]) {
  const v = new Float32Array(12);
  ivs.forEach((i, k) => (v[mod12(root + i)] = w[k]));
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  for (let i = 0; i < 12; i++) v[i] /= n;
  return v;
}
const dot12 = (a: Float32Array, ao: number, b: Float32Array) => { let s = 0; for (let i = 0; i < 12; i++) s += a[ao + i] * b[i]; return s; };

export function detectChords(input: Float32Array, sr: number, opts: DetectOptions = {}, onProgress: (p: number) => void = () => {}): Detection {
  const N = 8192, hop = 2048, penalty = opts.penalty ?? 0.2;
  let x = input;
  if (x.length < N) { const y = new Float32Array(N); y.set(x); x = y; }
  const nF = Math.floor((x.length - N) / hop) + 1;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const fft = makeFFT(N), re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
  const kmin = Math.max(2, Math.floor((55 * N) / sr)), kmax = Math.min(N / 2 - 2, Math.ceil((1800 * N) / sr));
  const chroma = new Float32Array(nF * 12), bass = new Float32Array(nF * 12), energy = new Float32Array(nF);

  for (let f = 0; f < nF; f++) {
    const o = f * hop;
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = kmin - 1; k <= kmax + 1; k++) mag[k] = Math.hypot(re[k], im[k]);
    for (let k = kmin; k <= kmax; k++) {
      const b = mag[k];
      if (b > mag[k - 1] && b >= mag[k + 1]) {
        const a = mag[k - 1], c = mag[k + 1], den = a - 2 * b + c, p = den ? (0.5 * (a - c)) / den : 0;
        const freq = ((k + p) * sr) / N, pc = mod12(Math.round(69 + 12 * Math.log2(freq / 440))), e = b * b;
        chroma[f * 12 + pc] += e;
        energy[f] += e;
        if (freq < 260) bass[f * 12 + pc] += e;
      }
    }
    if (f % 64 === 0) onProgress(f / nF);
  }
  for (let f = 0; f < nF; f++) {
    let n = 0, bm = 0;
    for (let i = 0; i < 12; i++) {
      const v = Math.sqrt(chroma[f * 12 + i]); chroma[f * 12 + i] = v; n += v * v;
      const bv = Math.sqrt(bass[f * 12 + i]); bass[f * 12 + i] = bv; if (bv > bm) bm = bv;
    }
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < 12; i++) { chroma[f * 12 + i] /= n; bass[f * 12 + i] /= bm || 1; }
  }
  const W = 2, sm = new Float32Array(nF * 12), bs = new Float32Array(nF * 12);
  for (let f = 0; f < nF; f++) {
    let n = 0;
    for (let i = 0; i < 12; i++) {
      let s = 0, t = 0;
      for (let d = -W; d <= W; d++) { const g = Math.min(nF - 1, Math.max(0, f + d)); s += chroma[g * 12 + i]; t += bass[g * 12 + i]; }
      sm[f * 12 + i] = s; bs[f * 12 + i] = t / (2 * W + 1); n += s * s;
    }
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < 12; i++) sm[f * 12 + i] /= n;
  }
  // tom global (perfis de Krumhansl-Kessler)
  const sortedE = Array.from(energy).sort((a, b) => a - b), ref = sortedE[Math.floor(sortedE.length * 0.95)] || 1;
  const tot = new Float32Array(12);
  for (let f = 0; f < nF; f++) if (energy[f] > ref * 0.01) for (let i = 0; i < 12; i++) tot[i] += chroma[f * 12 + i];
  let key = { tonic: 0, minor: false, r: -2 };
  for (let t = 0; t < 12; t++) {
    const rot = Array.from({ length: 12 }, (_, i) => tot[mod12(i + t)]);
    const rM = pearson(rot, KK_MAJ), rm = pearson(rot, KK_MIN);
    if (rM > key.r) key = { tonic: t, minor: false, r: rM };
    if (rm > key.r) key = { tonic: t, minor: true, r: rm };
  }
  const dia = diatonic(key.tonic, key.minor);
  const T: { root: number; minor: boolean; v: Float32Array }[] = [];
  for (let r = 0; r < 12; r++) {
    T.push({ root: r, minor: false, v: template(r, [0, 4, 7], [1, 0.9, 0.85]) });
    T.push({ root: r, minor: true, v: template(r, [0, 3, 7], [1, 0.9, 0.85]) });
  }
  const S = T.length + 1, em = new Float32Array(nF * S);
  for (let f = 0; f < nF; f++) {
    const silent = energy[f] < ref * 0.004;
    for (let s = 0; s < T.length; s++) {
      const t = T[s];
      let sc = dot12(sm, f * 12, t.v) + 0.1 * bs[f * 12 + t.root];
      if ((t.minor ? dia.min : dia.maj).includes(t.root)) sc += 0.03;
      em[f * S + s] = silent ? 0 : sc;
    }
    em[f * S + T.length] = silent ? 1 : 0.25;
  }
  // Viterbi: ficar no mesmo acorde é grátis, trocar custa `penalty`
  const dp = new Float32Array(S), nd = new Float32Array(S), bp = new Uint8Array(nF * S);
  for (let s = 0; s < S; s++) dp[s] = em[s];
  for (let f = 1; f < nF; f++) {
    let bi = 0;
    for (let s = 1; s < S; s++) if (dp[s] > dp[bi]) bi = s;
    for (let s = 0; s < S; s++) {
      const stay = dp[s], sw = dp[bi] - penalty;
      if (stay >= sw) { nd[s] = stay; bp[f * S + s] = s; } else { nd[s] = sw; bp[f * S + s] = bi; }
      nd[s] += em[f * S + s];
    }
    dp.set(nd);
  }
  const path = new Uint8Array(nF);
  let bi = 0;
  for (let s = 1; s < S; s++) if (dp[s] > dp[bi]) bi = s;
  path[nF - 1] = bi;
  for (let f = nF - 1; f > 0; f--) path[f - 1] = bp[f * S + path[f]];

  type Raw = { s: number; f0: number; f1: number };
  const segs: Raw[] = [];
  for (let f = 0; f < nF; f++) {
    const last = segs[segs.length - 1];
    if (last && last.s === path[f]) last.f1 = f; else segs.push({ s: path[f], f0: f, f1: f });
  }
  // trechos curtos demais (< 0,45 s) são absorvidos pelo anterior
  const minFrames = Math.ceil((0.45 * sr) / hop);
  const kept: Raw[] = [];
  for (const g of segs) {
    if (kept.length && g.f1 - g.f0 + 1 < minFrames) kept[kept.length - 1].f1 = g.f1;
    else if (kept.length && kept[kept.length - 1].s === g.s) kept[kept.length - 1].f1 = g.f1;
    else kept.push({ ...g });
  }
  const flats = keyPrefersFlats(key);
  const fT = (f: number) => (f * hop + N / 2) / sr;
  const segments: Segment[] = kept.map((g) => {
    const start = g.f0 === 0 ? 0 : fT(g.f0) - hop / sr / 2, end = fT(g.f1) + hop / sr / 2;
    if (g.s === T.length) return { start, end, label: '', none: true };
    const t = T[g.s];
    let suffix = t.minor ? 'm' : '';
    if (opts.sevenths) {
      const avg = new Float32Array(12);
      for (let f = g.f0; f <= g.f1; f++) for (let i = 0; i < 12; i++) avg[i] += sm[f * 12 + i];
      let n = 0;
      for (const v of avg) n += v * v;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < 12; i++) avg[i] /= n;
      const base = dot12(avg, 0, t.v);
      const cands: [string, number[]][] = t.minor ? [['m7', [0, 3, 7, 10]]] : [['7', [0, 4, 7, 10]], ['7M', [0, 4, 7, 11]]];
      let best: { sf: string; sc: number } | null = null;
      for (const [sf, ivs] of cands) {
        const sc = dot12(avg, 0, template(t.root, ivs, [1, 0.9, 0.85, 0.75]));
        if (sc > base + 0.02 && (!best || sc > best.sc)) best = { sf, sc };
      }
      if (best) suffix = best.sf;
    }
    return { start, end, label: noteName(t.root, flats) + suffix };
  });
  onProgress(1);
  return { segments, key: { tonic: key.tonic, minor: key.minor }, duration: input.length / sr };
}
