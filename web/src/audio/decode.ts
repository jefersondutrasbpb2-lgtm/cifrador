/** Decodifica áudio/vídeo no navegador e roda a detecção num Worker. */
import type { DetectOptions, Detection } from './detect';

export const ANALYSIS_RATE = 11025;

export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const ab = await file.arrayBuffer();
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);
}

/** Mixa para mono e reamostra para a taxa de análise. */
export async function toAnalysisSamples(buf: AudioBuffer, sr = ANALYSIS_RATE): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * sr)), sr);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

export function analyzeInWorker(samples: Float32Array, sr: number, opts: DetectOptions, onProgress: (p: number) => void): Promise<Detection> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.p);
      else if (m.type === 'done') { w.terminate(); resolve(m.result); }
      else { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    const copy = samples.slice();
    w.postMessage({ samples: copy, sr, opts }, [copy.buffer]);
  });
}
