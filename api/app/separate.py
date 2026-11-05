"""Separa voz e acompanhamento com Demucs (melhora acordes e letra)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def split_vocals(wav: Path, workdir: Path) -> tuple[Path, Path]:
    """Devolve (acompanhamento, voz)."""
    out = workdir / "demucs"
    proc = subprocess.run(
        [sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", str(out), str(wav)],
        capture_output=True, text=True, timeout=3600,
    )
    if proc.returncode != 0:
        raise RuntimeError("A separação de instrumentos falhou: " + proc.stderr.strip()[-300:])
    stem = out / "htdemucs" / wav.stem
    return stem / "no_vocals.wav", stem / "vocals.wav"
