"""Transcrição da letra com tempo de cada palavra (faster-whisper)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from .align import Word


@lru_cache(maxsize=1)
def _model():
    from faster_whisper import WhisperModel

    size = os.environ.get("CIFRADOR_WHISPER_MODEL", "small")
    device = os.environ.get("CIFRADOR_WHISPER_DEVICE", "auto")
    compute = os.environ.get("CIFRADOR_WHISPER_COMPUTE", "int8")
    return WhisperModel(size, device=device, compute_type=compute)


def transcribe(path: Path, language: str = "pt") -> list[Word]:
    segments, _ = _model().transcribe(
        str(path), language=language or None, word_timestamps=True, vad_filter=True,
        condition_on_previous_text=False,
    )
    words: list[Word] = []
    for seg in segments:
        for w in seg.words or []:
            if w.word.strip():
                words.append(Word(w.word, float(w.start), float(w.end)))
    return words
