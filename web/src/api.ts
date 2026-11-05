/** Cliente do servidor de análise (pasta /api). Opcional: o app funciona sem ele. */
export interface ApiChord { start: number; end: number; label: string }
export interface ApiResult {
  title: string;
  key: string;
  duration: number;
  chords: ApiChord[];
  words: { word: string; start: number; end: number }[];
  chordpro: string;
  warnings: string[];
}
export interface ApiOptions { lyrics: boolean; separate: boolean; language: string; sevenths: boolean }
interface Job { id: string; status: 'queued' | 'running' | 'done' | 'error'; step: string; progress: number; result?: ApiResult; error?: string }

export const apiBase = (url: string) => url.trim().replace(/\/+$/, '');

export async function apiHealth(base: string): Promise<{ ok: boolean; features: Record<string, boolean> }> {
  const r = await fetch(apiBase(base) + '/api/health');
  if (!r.ok) throw new Error('Servidor respondeu ' + r.status);
  return r.json();
}

async function startJob(base: string, body: FormData): Promise<Job> {
  const r = await fetch(apiBase(base) + '/api/jobs', { method: 'POST', body });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Falha ao enviar (' + r.status + ')');
  return r.json();
}

export async function runJob(
  base: string, src: { file?: File; url?: string }, opts: ApiOptions,
  onStep: (step: string, progress: number) => void,
): Promise<ApiResult> {
  const fd = new FormData();
  if (src.file) fd.append('file', src.file);
  if (src.url) fd.append('url', src.url);
  fd.append('lyrics', String(opts.lyrics));
  fd.append('separate', String(opts.separate));
  fd.append('sevenths', String(opts.sevenths));
  fd.append('language', opts.language);
  let job = await startJob(base, fd);
  while (job.status === 'queued' || job.status === 'running') {
    onStep(job.step, job.progress);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(apiBase(base) + '/api/jobs/' + job.id);
    if (!r.ok) throw new Error('Perdi o contato com o servidor (' + r.status + ')');
    job = await r.json();
  }
  if (job.status === 'error' || !job.result) throw new Error(job.error || 'A análise falhou no servidor.');
  return job.result;
}
