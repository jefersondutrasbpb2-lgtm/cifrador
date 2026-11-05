import './styles.css';
import { SAMPLE } from './sample';
import {
  type Chord, type Key, chordName, estimateKeyFromChords, keyLabel, keyPrefersFlats, mod12, noteName, parseChord, parseKeyName,
} from './music/theory';
import { layoutChordLine, parseSheet, sheetChords, transposeText, type Sheet } from './music/sheet';
import { guitarVoicings, suggestCapo } from './music/guitar';
import { guitarSVG, keysSVG } from './music/diagrams';
import type { Detection, Segment } from './audio/detect';
import { ANALYSIS_RATE, analyzeInWorker, decodeFile, toAnalysisSamples } from './audio/decode';
import { synthDemo, wavBlob } from './audio/demo';
import { songs, saveSongs, store, type Song } from './storage';
import { apiHealth, runJob, type ApiResult } from './api';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (s: number) => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
const src = $<HTMLTextAreaElement>('src');

const S = {
  semis: 0, inst: 'guitar' as 'guitar' | 'keys', capo: 0, acc: 'auto' as 'auto' | 's' | 'b',
  size: 17, voice: {} as Record<string, number>, editor: true, songId: null as string | null,
};
let origKey: Key | null = null;

const curShift = () => S.semis - (S.inst === 'guitar' ? S.capo : 0);
const shifted = (k: Key | null, n: number): Key | null => (k ? { tonic: mod12(k.tonic + n), minor: k.minor } : null);
const useFlats = (k: Key | null) => (S.acc === 'auto' ? keyPrefersFlats(k) : S.acc === 'b');

/* ---------------- desenhos ---------------- */
function diagramFor(name: string, flats: boolean, idx = 0): string {
  const ch = parseChord(name);
  if (!ch) return '';
  if (S.inst === 'keys') {
    const notes = [...ch.iv].sort((a, b) => a - b).map((i) => noteName(ch.root + i, flats)).join(' ');
    return keysSVG(ch.root, ch.iv, ch.bass) + `<div class="notes">${esc((ch.bass != null ? noteName(ch.bass, flats) + ' | ' : '') + notes)}</div>`;
  }
  const vs = guitarVoicings(ch.root, ch.iv, ch.bass);
  if (!vs.length) return '<div class="notes">sem posição</div>';
  return guitarSVG(vs[Math.min(idx, vs.length - 1)], ch.root);
}

/* ---------------- cifra ---------------- */
function renderSheet() {
  const text = src.value;
  const parsed: Sheet = parseSheet(text);
  const chs: Chord[] = sheetChords(parsed);
  origKey = parseKeyName(parsed.meta.key) || estimateKeyFromChords(chs);
  const sk = shifted(origKey, S.semis), shk = shifted(origKey, curShift()), flats = useFlats(shk), shift = curShift();
  $('shTitle').textContent = $<HTMLInputElement>('songTitle').value || parsed.meta.title || 'Sem título';
  $('shSub').textContent = $<HTMLInputElement>('songArtist').value || parsed.meta.artist || '';
  $('keyBox').textContent = keyLabel(sk, useFlats(sk));

  let kl = '';
  if (origKey) {
    kl += `<span class="pill">Tom original ${esc(keyLabel(origKey))}</span>`;
    if (S.semis) kl += `<span class="pill">${S.semis > 0 ? '+' : ''}${S.semis} semitom${Math.abs(S.semis) > 1 ? 's' : ''} · soa em ${esc(keyLabel(sk, useFlats(sk)))}</span>`;
    if (S.inst === 'guitar' && S.capo) kl += `<span class="pill warn">Capo na ${S.capo}ª casa · formas de ${esc(keyLabel(shk, flats))}</span>`;
  }
  const sug = S.inst === 'guitar' ? suggestCapo(chs, S.semis, S.capo) : null;
  if (sug != null && sug !== S.capo) kl += `<span class="pill">Mais fácil com capo ${sug} <button id="applyCapo" data-c="${sug}">usar</button></span>`;
  $('keyLine').innerHTML = kl;
  const ap = document.getElementById('applyCapo');
  if (ap) ap.onclick = () => { S.capo = Number(ap.dataset.c); $<HTMLSelectElement>('capoSel').value = String(S.capo); renderSheet(); };

  const seen: string[] = [];
  let html = '';
  for (const l of parsed.lines) {
    if (l.kind === 'blank') { if (html) html += '<div class="gap"></div>'; continue; }
    if (l.kind === 'sec') { html += `<div class="ln sec">${esc(l.text)}</div>`; continue; }
    if (l.kind === 'lyr') { html += `<div class="ln lyr">${esc(l.text)}</div>`; continue; }
    const parts = layoutChordLine(l.toks, shift, flats);
    html += '<div class="ln chords">' + parts.map((p) => {
      if (!p.chord) return esc(p.text);
      if (!seen.includes(p.chord)) seen.push(p.chord);
      return `<b class="ch" data-c="${esc(p.chord)}">${esc(p.chord)}</b>`;
    }).join('') + '</div>';
  }
  $('sheet').innerHTML = html || '<p class="empty">Cole ou escreva uma cifra no editor para ela aparecer aqui.</p>';

  $('diagrams').innerHTML = seen.map((nm) => {
    const ch = parseChord(nm)!;
    const n = S.inst === 'guitar' ? guitarVoicings(ch.root, ch.iv, ch.bass).length : 0;
    const idx = S.voice[nm] || 0;
    const cyc = n > 1 ? `<div class="cyc"><button data-d="-1" aria-label="Posição anterior de ${esc(nm)}">‹</button>${Math.min(idx, n - 1) + 1}/${n}<button data-d="1" aria-label="Próxima posição de ${esc(nm)}">›</button></div>` : '';
    return `<div class="dcard" data-c="${esc(nm)}"><div class="nm">${esc(nm)}</div>${diagramFor(nm, flats, idx)}${cyc}</div>`;
  }).join('');
  store.set('draft', { text, title: $<HTMLInputElement>('songTitle').value, artist: $<HTMLInputElement>('songArtist').value, id: S.songId });
}

$('diagrams').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-d]');
  if (!b) return;
  const nm = b.closest<HTMLElement>('.dcard')!.dataset.c!, ch = parseChord(nm)!;
  const n = guitarVoicings(ch.root, ch.iv, ch.bass).length;
  S.voice[nm] = (((S.voice[nm] || 0) + Number(b.dataset.d)) % n + n) % n;
  renderSheet();
});
$('sheet').addEventListener('click', (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>('.ch');
  if (!c) return;
  const card = [...document.querySelectorAll<HTMLElement>('.dcard')].find((d) => d.dataset.c === c.dataset.c);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  }
});

/* ---------------- controles ---------------- */
const capoSel = $<HTMLSelectElement>('capoSel');
for (let c = 0; c <= 9; c++) capoSel.insertAdjacentHTML('beforeend', `<option value="${c}">${c ? c + 'ª casa' : 'Sem capo'}</option>`);
$('tUp').onclick = () => { S.semis = S.semis >= 11 ? 0 : S.semis + 1; renderSheet(); };
$('tDown').onclick = () => { S.semis = S.semis <= -11 ? 0 : S.semis - 1; renderSheet(); };
$('tReset').onclick = () => { S.semis = 0; renderSheet(); };
capoSel.onchange = () => { S.capo = Number(capoSel.value); renderSheet(); };
$<HTMLSelectElement>('accSel').onchange = (e) => { S.acc = (e.target as HTMLSelectElement).value as typeof S.acc; renderSheet(); };

function setInst(i: typeof S.inst) {
  S.inst = i;
  $('instGuitar').setAttribute('aria-pressed', String(i === 'guitar'));
  $('instKeys').setAttribute('aria-pressed', String(i === 'keys'));
  $('capoGrp').hidden = i !== 'guitar';
  store.set('inst', i);
  renderSheet();
  if (result) renderNow(true);
}
$('instGuitar').onclick = () => setInst('guitar');
$('instKeys').onclick = () => setInst('keys');

function setSize(v: number) {
  S.size = Math.max(12, Math.min(30, v));
  document.documentElement.style.setProperty('--sheet-size', S.size + 'px');
  store.set('size', S.size);
}
$('fUp').onclick = () => setSize(S.size + 1);
$('fDown').onclick = () => setSize(S.size - 1);

function setEditor(on: boolean) {
  S.editor = on;
  $('cifraGrid').classList.toggle('no-editor', !on);
  $('editorBtn').setAttribute('aria-pressed', String(on));
}
$('editorBtn').onclick = () => setEditor(!S.editor);

let typing = 0;
for (const id of ['src', 'songTitle', 'songArtist']) $(id).addEventListener('input', () => { clearTimeout(typing); typing = window.setTimeout(renderSheet, 180); });

/* rolagem automática */
let scrolling = false, lastT = 0, acc = 0, wake: WakeLockSentinel | null = null;
function scrollLoop(t: number) {
  if (!scrolling) return;
  if (lastT) {
    acc += ((t - lastT) / 1000) * Number($<HTMLInputElement>('scrollSpeed').value) * 9;
    const px = Math.floor(acc);
    if (px) { window.scrollBy(0, px); acc -= px; }
  }
  lastT = t;
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { toggleScroll(false); return; }
  requestAnimationFrame(scrollLoop);
}
async function toggleScroll(on: boolean) {
  scrolling = on;
  const b = $('scrollBtn');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '❚❚ Pausar' : '▶ Rolar';
  if (on) {
    lastT = 0;
    requestAnimationFrame(scrollLoop);
    try { wake = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* sem wake lock */ }
  } else { wake?.release().catch(() => {}); wake = null; }
}
$('scrollBtn').onclick = () => toggleScroll(!scrolling);

/* editor */
function edMsg(t: string) {
  $('edStatus').textContent = t;
  window.setTimeout(() => { if ($('edStatus').textContent === t) $('edStatus').textContent = ''; }, 3500);
}
async function copy(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); edMsg(ok); }
  catch { src.focus(); src.select(); edMsg('Texto selecionado. Use Ctrl+C para copiar.'); }
}
$('saveBtn').onclick = () => {
  const list = songs(), p = parseSheet(src.value);
  const rec: Song = {
    id: S.songId || 's' + Date.now(),
    title: $<HTMLInputElement>('songTitle').value || p.meta.title || 'Sem título',
    artist: $<HTMLInputElement>('songArtist').value || p.meta.artist || '',
    text: src.value, updated: Date.now(),
  };
  const i = list.findIndex((s) => s.id === rec.id);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  S.songId = rec.id;
  saveSongs(list);
  renderLib();
  edMsg(`“${rec.title}” salva na biblioteca.`);
};
$<HTMLInputElement>('importFile').onchange = async (e) => {
  const inp = e.target as HTMLInputElement, f = inp.files?.[0];
  if (!f) return;
  loadSong({ title: '', artist: '', text: await f.text(), id: null });
  edMsg(`Arquivo “${f.name}” aberto.`);
  inp.value = '';
};
$('copyBtn').onclick = () => copy(src.value, 'Texto copiado.');
$('copyTrBtn').onclick = () => {
  const shk = shifted(origKey, curShift());
  copy(transposeText(src.value, curShift(), useFlats(shk)), 'Texto copiado no tom atual.');
};
$('newBtn').onclick = () => { loadSong({ title: '', artist: '', text: '', id: null }); src.focus(); };
function loadSong(s: { title: string; artist: string; text: string; id: string | null }) {
  $<HTMLInputElement>('songTitle').value = s.title || '';
  $<HTMLInputElement>('songArtist').value = s.artist || '';
  src.value = s.text || '';
  S.songId = s.id; S.semis = 0; S.capo = 0; capoSel.value = '0'; S.voice = {};
  renderSheet();
}

/* biblioteca */
function renderLib() {
  const list = songs();
  if (!list.length) { $('libGrid').innerHTML = '<p class="empty">Nenhuma cifra salva ainda. No editor, toque em “Salvar na biblioteca”.</p>'; return; }
  $('libGrid').innerHTML = list.map((s) => {
    const ch = [...new Set(sheetChords(parseSheet(s.text)).map((c) => chordName(c)))].slice(0, 10).join('  ');
    return `<article class="song" data-id="${s.id}"><h4>${esc(s.title)}</h4><div class="meta">${esc(s.artist || 'Artista não informado')} · ${new Date(s.updated).toLocaleDateString('pt-BR')}</div><div class="chs">${esc(ch)}</div><div class="row"><button class="btn primary" data-a="open">Abrir</button><button class="btn ghost" data-a="del">Excluir</button></div></article>`;
  }).join('');
}
$('libGrid').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  const id = b.closest<HTMLElement>('.song')!.dataset.id!, list = songs(), s = list.find((x) => x.id === id);
  if (b.dataset.a === 'open' && s) { loadSong(s); showTab('cifra'); }
  else if (b.dataset.a === 'del') { b.textContent = 'Confirmar exclusão'; b.dataset.a = 'del2'; b.style.color = 'var(--danger)'; }
  else if (b.dataset.a === 'del2') { saveSongs(list.filter((x) => x.id !== id)); if (S.songId === id) S.songId = null; renderLib(); }
});

/* abas */
function showTab(t: string) {
  document.querySelectorAll<HTMLElement>('.view').forEach((v) => (v.hidden = v.id !== 'tab-' + t));
  document.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  if (t !== 'cifra' && scrolling) toggleScroll(false);
  store.set('tab', t);
}
document.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)));

/* ---------------- áudio ---------------- */
let result: Detection | null = null, mediaEl: HTMLMediaElement | null = null, mediaUrl: string | null = null;
let editing = false, raf = 0, fileLabel = '', fullSheet: ApiResult | null = null, apiOn = false;

function auStatus(t: string, err = false) { $('auStatus').textContent = t; $('auStatus').classList.toggle('err', err); }
const setProg = (p: number) => ($('prog').style.width = (p * 100).toFixed(0) + '%');

function setMedia(url: string, isVideo: boolean) {
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = url;
  $('media').innerHTML = isVideo ? '<video id="player" controls playsinline></video>' : '<audio id="player" controls></audio>';
  mediaEl = $<HTMLMediaElement>('player');
  mediaEl.src = url;
  mediaEl.addEventListener('play', () => {
    cancelAnimationFrame(raf);
    const loop = () => { renderNow(); if (mediaEl && !mediaEl.paused) raf = requestAnimationFrame(loop); };
    loop();
  });
  mediaEl.addEventListener('seeked', () => renderNow());
  mediaEl.addEventListener('pause', () => renderNow());
}

async function analyzeLocal(buf: AudioBuffer) {
  const samples = await toAnalysisSamples(buf);
  auStatus('Analisando as notas…');
  return analyzeInWorker(samples, ANALYSIS_RATE, {
    penalty: Number($<HTMLSelectElement>('optSens').value), sevenths: $<HTMLInputElement>('optSev').checked,
  }, setProg);
}

function apiOptions() {
  return {
    lyrics: $<HTMLInputElement>('apiLyrics').checked, separate: $<HTMLInputElement>('apiSeparate').checked,
    sevenths: $<HTMLInputElement>('optSev').checked, language: 'pt',
  };
}
const STEP: Record<string, string> = {
  queued: 'Na fila…', download: 'Baixando o áudio…', decode: 'Lendo o áudio…', separate: 'Separando os instrumentos…',
  chords: 'Tirando os acordes…', lyrics: 'Transcrevendo a letra…', align: 'Encaixando acordes na letra…',
};
async function analyzeOnServer(srcIn: { file?: File; url?: string }) {
  const r = await runJob($<HTMLInputElement>('apiUrl').value, srcIn, apiOptions(), (step, p) => { auStatus(STEP[step] || step); setProg(p); });
  setProg(1);
  return r;
}
function fromApi(r: ApiResult): Detection {
  const key = parseKeyName(r.key) || { tonic: 0, minor: false };
  return { key, duration: r.duration, segments: r.chords.map((c) => ({ ...c, none: !c.label })) };
}

async function handleFile(file: File | undefined) {
  if (!file) return;
  fileLabel = file.name.replace(/\.[^.]+$/, '');
  setProg(0);
  fullSheet = null;
  auStatus(`Lendo “${file.name}”…`);
  const isVideo = /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
  try {
    setMedia(URL.createObjectURL(file), isVideo);
    if (apiOn && $<HTMLInputElement>('apiUse').checked) {
      fullSheet = await analyzeOnServer({ file });
      showResult(fromApi(fullSheet));
    } else {
      showResult(await analyzeLocal(await decodeFile(file)));
    }
  } catch (err) {
    console.error(err);
    auStatus(err instanceof Error && apiOn ? err.message : 'Não consegui ler o áudio desse arquivo. Tente um mp3, m4a, wav, mp4 ou webm.', true);
  }
}

function showResult(res: Detection) {
  result = res;
  const n = res.segments.filter((s) => !s.none).length;
  const warn = fullSheet?.warnings?.length ? ' ' + fullSheet.warnings.join(' ') : '';
  auStatus(`Pronto: ${n} trechos com acorde em ${fmt(res.duration)}. Dê play para acompanhar e corrija o que soar errado.${warn}`);
  $('resTitle').textContent = fullSheet?.title || fileLabel || 'Resultado';
  $('resKey').textContent = 'Tom estimado: ' + keyLabel(res.key);
  $('resActions').hidden = false;
  $('nowBox').hidden = false;
  $('openFull').hidden = !fullSheet?.chordpro;
  renderTimeline();
  renderNow(true);
}

function segAt(t: number) {
  const s = result!.segments;
  let i = s.findIndex((g) => t >= g.start && t < g.end);
  if (i < 0) i = t < (s[0]?.start || 0) ? 0 : s.length - 1;
  return i;
}
let lastNow = -2;
function renderNow(force = false) {
  if (!result) return;
  const t = mediaEl ? mediaEl.currentTime : 0, i = segAt(t), seg: Segment | undefined = result.segments[i];
  if (!seg) return;
  $('nowBar').style.width = Math.min(1, (t - seg.start) / Math.max(0.01, seg.end - seg.start)) * 100 + '%';
  if (i === lastNow && !force) return;
  lastNow = i;
  const next = result.segments.find((g, k) => k > i && !g.none);
  $('nowChord').textContent = seg.none ? '–' : seg.label;
  $('nextChord').textContent = next ? next.label : 'fim';
  $('nowDiag').innerHTML = seg.none ? '' : diagramFor(seg.label, keyPrefersFlats(result.key));
  document.querySelectorAll<HTMLElement>('.chip').forEach((c) => c.classList.toggle('cur', Number(c.dataset.i) === i));
}
function renderTimeline() {
  $('timeline').innerHTML = result!.segments.map((g, i) => (g.none ? '' :
    `<button class="chip" data-i="${i}"><span class="c">${esc(g.label)}</span><span class="t">${fmt(g.start)}</span></button>`)).join('');
}
$('timeline').addEventListener('click', (e) => {
  const target = e.target as HTMLElement, chip = target.closest<HTMLElement>('.chip');
  if (!chip || !result || target.tagName === 'INPUT') return;
  const i = Number(chip.dataset.i), g = result.segments[i];
  if (!editing) { if (mediaEl) { mediaEl.currentTime = g.start + 0.01; renderNow(true); } return; }
  chip.querySelector('.c')!.outerHTML = `<input id="chipEdit" value="${esc(g.label)}" aria-label="Acorde em ${fmt(g.start)}">`;
  const inp = $<HTMLInputElement>('chipEdit');
  inp.focus(); inp.select();
  inp.addEventListener('blur', () => {
    const v = inp.value.trim();
    if (!v) { result!.segments.splice(i, 1); if (i > 0) result!.segments[i - 1].end = g.end; }
    else if (parseChord(v)) g.label = v;
    fullSheet = null; $('openFull').hidden = true; // a cifra com letra não reflete mais as correções
    renderTimeline(); lastNow = -2; renderNow(true);
  }, { once: true });
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') inp.blur();
    if (ev.key === 'Escape') { inp.value = g.label; inp.blur(); }
  });
});
$('editChips').onclick = () => {
  editing = !editing;
  $('editChips').setAttribute('aria-pressed', String(editing));
  $('editHint').hidden = !editing;
};
$('toSheet').onclick = () => {
  if (!result) return;
  const segs = result.segments.filter((g) => !g.none);
  let txt = `{t: ${fileLabel || 'Música'}}\n{key: ${keyLabel(result.key)}}\n\n[Acordes tirados do áudio]\n`;
  for (let i = 0; i < segs.length; i += 4) {
    const grp = segs.slice(i, i + 4);
    txt += fmt(grp[0].start).padEnd(7) + grp.map((g) => g.label.padEnd(8)).join('').trimEnd() + '\n\n';
  }
  txt += '[Escreva a letra embaixo de cada linha de acordes]\n';
  loadSong({ title: fileLabel, artist: '', text: txt, id: null });
  setEditor(true); showTab('cifra'); window.scrollTo(0, 0);
};
$('openFull').onclick = () => {
  if (!fullSheet) return;
  loadSong({ title: fullSheet.title || fileLabel, artist: '', text: fullSheet.chordpro, id: null });
  showTab('cifra'); window.scrollTo(0, 0);
};
$<HTMLInputElement>('mediaFile').onchange = (e) => { const inp = e.target as HTMLInputElement; handleFile(inp.files?.[0]); inp.value = ''; };
const drop = $('drop');
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', (e) => handleFile((e as DragEvent).dataTransfer?.files[0]));

$('demoBtn').onclick = async () => {
  fileLabel = 'Exemplo sintetizado'; fullSheet = null; setProg(0);
  auStatus('Gerando o áudio de exemplo…');
  try {
    const buf = await synthDemo();
    setMedia(URL.createObjectURL(wavBlob(buf)), false);
    showResult(await analyzeLocal(buf));
  } catch (e) { console.error(e); auStatus('Este navegador não conseguiu gerar o áudio de exemplo.', true); }
};

/* servidor */
async function connectApi() {
  const url = $<HTMLInputElement>('apiUrl').value.trim();
  store.set('api', url);
  if (!url) { apiOn = false; $('apiBox').hidden = true; $('apiFeat').innerHTML = ''; return; }
  $('apiFeat').innerHTML = '<span>Conectando…</span>';
  try {
    const h = await apiHealth(url);
    apiOn = true;
    $('apiBox').hidden = false;
    const names: Record<string, string> = { youtube: 'YouTube', lyrics: 'Letra (Whisper)', separate: 'Separação (Demucs)', ffmpeg: 'ffmpeg' };
    $('apiFeat').innerHTML = '<span class="on">Conectado</span>' + Object.entries(h.features)
      .map(([k, v]) => `<span class="${v ? 'on' : ''}">${esc(names[k] || k)}${v ? '' : ' indisponível'}</span>`).join('');
    $<HTMLInputElement>('apiLyrics').disabled = !h.features.lyrics;
    $<HTMLInputElement>('apiLyrics').checked = !!h.features.lyrics;
    $<HTMLInputElement>('apiSeparate').disabled = !h.features.separate;
    $<HTMLInputElement>('ytUrl').disabled = $<HTMLButtonElement>('ytGo').disabled = !h.features.youtube;
  } catch {
    apiOn = false;
    $('apiBox').hidden = true;
    $('apiFeat').innerHTML = '<span>Não consegui falar com o servidor. Confira o endereço e se ele está rodando.</span>';
  }
}
$('apiConnect').onclick = connectApi;
$('ytGo').onclick = async () => {
  const url = $<HTMLInputElement>('ytUrl').value.trim();
  if (!url) return;
  setProg(0); fileLabel = '';
  try {
    fullSheet = await analyzeOnServer({ url });
    fileLabel = fullSheet.title;
    $('media').innerHTML = `<p class="hint">Áudio do link analisado no servidor. <a href="${esc(url)}" target="_blank" rel="noopener">Abrir o vídeo</a> para ouvir junto.</p>`;
    mediaEl = null;
    showResult(fromApi(fullSheet));
  } catch (e) { auStatus(e instanceof Error ? e.message : 'A análise falhou.', true); }
};

/* ---------------- início ---------------- */
(function init() {
  const draft = store.get<{ text: string; title: string; artist: string; id: string | null } | null>('draft', null);
  if (draft?.text?.trim()) {
    src.value = draft.text;
    $<HTMLInputElement>('songTitle').value = draft.title || '';
    $<HTMLInputElement>('songArtist').value = draft.artist || '';
    S.songId = draft.id || null;
  } else src.value = SAMPLE;
  setSize(store.get('size', 17));
  S.inst = store.get<typeof S.inst>('inst', 'guitar');
  $('instGuitar').setAttribute('aria-pressed', String(S.inst === 'guitar'));
  $('instKeys').setAttribute('aria-pressed', String(S.inst === 'keys'));
  $('capoGrp').hidden = S.inst !== 'guitar';
  setEditor(!window.matchMedia('(max-width: 860px)').matches);
  renderSheet();
  renderLib();
  showTab(store.get('tab', 'cifra'));
  const api = store.get('api', '') || (import.meta.env.VITE_API_URL as string | undefined) || '';
  if (api) { $<HTMLInputElement>('apiUrl').value = api; connectApi(); }
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
