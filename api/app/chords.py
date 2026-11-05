"""
Reconhecimento de acordes.

CQT (7 oitavas) → cromagrama de 12 notas + cromagrama do baixo → sincronizado
com as batidas da música → comparação com modelos de acordes → Viterbi.
Trocar de acorde só acontece em batidas, o que deixa o resultado mais "musical"
do que a versão do navegador.
"""
from __future__ import annotations

from dataclasses import dataclass

import librosa
import numpy as np

from .theory import diatonic, estimate_key, estimate_key_from_chords, key_name, note, prefers_flats

SR = 22050
HOP = 512


@dataclass
class ChordSegment:
    start: float
    end: float
    label: str  # "" = sem acorde (silêncio)


@dataclass
class ChordResult:
    segments: list[ChordSegment]
    key: str
    tempo: float
    duration: float


QUALITIES_BASE = [("", [0, 4, 7], [1, 0.9, 0.85]), ("m", [0, 3, 7], [1, 0.9, 0.85])]
QUALITIES_7 = [
    ("7", [0, 4, 7, 10], [1, 0.9, 0.85, 0.7]),
    ("7M", [0, 4, 7, 11], [1, 0.9, 0.85, 0.7]),
    ("m7", [0, 3, 7, 10], [1, 0.9, 0.85, 0.7]),
]


def _templates(sevenths: bool):
    out = []
    for suffix, ivs, w in QUALITIES_BASE + (QUALITIES_7 if sevenths else []):
        for r in range(12):
            v = np.zeros(12)
            for i, wi in zip(ivs, w):
                v[(r + i) % 12] = wi
            out.append((r, suffix, v / np.linalg.norm(v)))
    return out


def features(y: np.ndarray, sr: int = SR):
    """Cromagrama (12 x T), cromagrama do baixo (12 x T) e energia (T)."""
    yh = librosa.effects.harmonic(y=y, margin=2.0)
    C = np.abs(librosa.cqt(y=yh, sr=sr, hop_length=HOP, fmin=librosa.note_to_hz("C1"),
                           n_bins=84 * 3, bins_per_octave=36))
    C = np.log1p(10.0 * C / (C.max() + 1e-9))
    semis = C.reshape(84, 3, -1).max(axis=1)          # 84 semitons C1..B7
    chroma = semis.reshape(7, 12, -1).sum(axis=0)       # dobra as oitavas
    bass = semis[:28].copy()                            # C1..D#3
    bass_chroma = np.zeros((12, semis.shape[1]))
    for i in range(28):
        bass_chroma[i % 12] += bass[i]
    energy = semis.sum(axis=0)
    return chroma, bass_chroma, energy


def analyze(y: np.ndarray, sr: int = SR, *, sevenths: bool = False, penalty: float = 0.25) -> ChordResult:
    duration = len(y) / sr
    chroma, bass, energy = features(y, sr)
    n = chroma.shape[1]
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP, units="frames")
    tempo = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 0.0
    beats = np.asarray(beats, dtype=int)
    if len(beats) < 4 or tempo <= 0:
        step = max(1, int(0.5 * sr / HOP))              # sem batida clara: blocos de 0,5 s
        beats = np.arange(step, n, step)
    else:
        # meia batida: pega trocas de acorde no contratempo
        mids = ((beats[:-1] + beats[1:]) // 2)
        beats = np.unique(np.concatenate([beats, mids]))
    beats = beats[(beats > 0) & (beats < n)]
    bounds = np.concatenate([[0], beats, [n]])

    sync_c = librosa.util.sync(chroma, beats, aggregate=np.median)
    sync_b = librosa.util.sync(bass, beats, aggregate=np.mean)
    sync_e = librosa.util.sync(energy[None, :], beats, aggregate=np.mean)[0]
    m = sync_c.shape[1]

    norm_c = sync_c / (np.linalg.norm(sync_c, axis=0, keepdims=True) + 1e-9)
    norm_b = sync_b / (sync_b.max(axis=0, keepdims=True) + 1e-9)

    tpl = _templates(sevenths)
    T = np.stack([v for _, _, v in tpl])                # K x 12
    roots = np.array([r for r, _, _ in tpl])
    base = T @ norm_c + 0.1 * norm_b[roots]             # K x m
    for k, (_, suf, _) in enumerate(tpl):
        if suf not in ("", "m"):
            base[k] -= 0.02                             # só usa sétima quando ela soa claramente
    ref = np.percentile(sync_e, 95) if m else 1.0
    silent = sync_e < 0.05 * ref
    base[:, silent] = 0.0
    base = np.vstack([base, np.where(silent, 1.0, 0.3)[None, :]])
    widths = np.diff(bounds).astype(float)

    def decode(bias: tuple[set[int], set[int]] | None) -> list[int]:
        em = base.copy()
        if bias:
            dmaj, dmin = bias
            for k, (r, suf, _) in enumerate(tpl):
                if r in (dmin if suf.startswith("m") else dmaj):
                    em[k] += 0.03
        return viterbi(em, penalty)

    # 1ª passada sem preferência de tom → tom pelos acordes → 2ª passada favorecendo o tom
    path = decode(None)
    found = [(tpl[s][0], tpl[s][1].startswith("m"), widths[i]) for i, s in enumerate(path) if s < len(tpl)]
    key = estimate_key_from_chords(found) or estimate_key(norm_c.sum(axis=1))
    tonic, minor = key
    path = decode(diatonic(tonic, minor))
    flats = prefers_flats(tonic, minor)
    labels = [note(r, flats) + suf for r, suf, _ in tpl] + [""]

    times = librosa.frames_to_time(bounds, sr=sr, hop_length=HOP)
    times[-1] = duration
    segs: list[ChordSegment] = []
    for i, s in enumerate(path):
        lab = labels[s]
        if segs and segs[-1].label == lab:
            segs[-1].end = float(times[i + 1])
        else:
            segs.append(ChordSegment(float(times[i]), float(times[i + 1]), lab))
    return ChordResult(segs, key_name(tonic, minor), tempo, duration)


def viterbi(em: np.ndarray, penalty: float) -> list[int]:
    """Caminho de maior pontuação; trocar de estado custa `penalty`."""
    K, m = em.shape
    if m == 0:
        return []
    dp = em[:, 0].copy()
    bp = np.zeros((K, m), dtype=np.int32)
    for t in range(1, m):
        best = int(np.argmax(dp))
        switch = dp[best] - penalty
        stay = dp >= switch
        bp[:, t] = np.where(stay, np.arange(K), best)
        dp = np.where(stay, dp, switch) + em[:, t]
    path = [int(np.argmax(dp))]
    for t in range(m - 1, 0, -1):
        path.append(int(bp[path[-1], t]))
    return path[::-1]
