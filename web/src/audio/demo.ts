/** Áudio de exemplo sintetizado (G · D · Em · C) para testar sem arquivo. */
export async function synthDemo(): Promise<AudioBuffer> {
  const sr = 22050, dur = 2, reps = 2;
  const prog = [[43, 59, 62, 67], [38, 57, 62, 66], [40, 59, 64, 67], [36, 60, 64, 67]];
  const off = new OfflineAudioContext(1, Math.ceil((prog.length * dur * reps + 0.5) * sr), sr);
  const master = off.createGain();
  master.gain.value = 0.16;
  master.connect(off.destination);
  for (let r = 0; r < reps; r++) prog.forEach((notes, k) => {
    const t0 = (r * prog.length + k) * dur;
    for (let beat = 0; beat < 4; beat++) {
      const tb = t0 + (beat * dur) / 4;
      notes.forEach((m, ni) => {
        const o = off.createOscillator(), g = off.createGain();
        o.type = ni === 0 ? 'sine' : 'triangle';
        o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
        g.gain.setValueAtTime(0, tb);
        g.gain.linearRampToValueAtTime(ni === 0 ? 1.2 : 0.7, tb + 0.01);
        g.gain.exponentialRampToValueAtTime(0.05, tb + dur / 4);
        o.connect(g); g.connect(master);
        o.start(tb + ni * 0.012); o.stop(tb + dur / 4 + 0.02);
      });
    }
  });
  return off.startRendering();
}

export function wavBlob(buf: AudioBuffer): Blob {
  const d = buf.getChannelData(0), n = d.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  return new Blob([ab], { type: 'audio/wav' });
}
