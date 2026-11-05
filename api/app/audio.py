"""Conversão de qualquer áudio/vídeo para WAV mono com ffmpeg."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import librosa
import numpy as np


def to_wav(src: Path, dst: Path, sr: int) -> Path:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg não está instalado no servidor.")
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-vn", "-ac", "1", "-ar", str(sr), "-f", "wav", str(dst)],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode != 0 or not dst.exists():
        raise RuntimeError("Não consegui ler o áudio desse arquivo: " + (proc.stderr.strip()[-300:] or "formato desconhecido"))
    return dst


def load(path: Path, sr: int) -> np.ndarray:
    y, _ = librosa.load(str(path), sr=sr, mono=True)
    return y
