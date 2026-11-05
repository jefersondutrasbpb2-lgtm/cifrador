"""Descobre quais recursos opcionais estão instalados."""
from __future__ import annotations

import importlib.util
import shutil


def has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def available() -> dict[str, bool]:
    return {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "youtube": has("yt_dlp"),
        "lyrics": has("faster_whisper"),
        "separate": has("demucs"),
    }
