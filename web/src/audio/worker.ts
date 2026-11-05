/// <reference lib="webworker" />
import { detectChords, type DetectOptions } from './detect';

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sr: number; opts: DetectOptions }>) => {
  const { samples, sr, opts } = e.data;
  try {
    const result = detectChords(samples, sr, opts, (p) => self.postMessage({ type: 'progress', p }));
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
