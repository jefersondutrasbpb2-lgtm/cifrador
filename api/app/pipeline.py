"""Etapas da análise: baixar → ler → (separar) → acordes → (letra) → montar a cifra."""
from __future__ import annotations

import shutil
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from . import audio, chords
from .align import to_chordpro
from .features import available

Progress = Callable[[str, float], None]


def run(*, file_path: Path | None, url: str | None, title: str, lyrics: bool, separate: bool,
        sevenths: bool, language: str, progress: Progress) -> dict:
    feats = available()
    warnings: list[str] = []
    work = Path(tempfile.mkdtemp(prefix="cifrador-"))
    try:
        if url:
            if not feats["youtube"]:
                raise RuntimeError("O servidor não tem o yt-dlp instalado para ler links.")
            progress("download", 0.05)
            from .youtube import download
            file_path, yt_title = download(url, work)
            title = title or yt_title
        assert file_path is not None

        progress("decode", 0.15)
        wav = audio.to_wav(file_path, work / "audio.wav", 44100)
        harmony_src, voice_src = wav, wav

        if separate:
            if feats["separate"]:
                progress("separate", 0.25)
                from .separate import split_vocals
                harmony_src, voice_src = split_vocals(wav, work)
            else:
                warnings.append("Separação de instrumentos indisponível no servidor.")

        progress("chords", 0.55)
        y = audio.load(harmony_src, chords.SR)
        res = chords.analyze(y, chords.SR, sevenths=sevenths)
        chord_list = [asdict(s) for s in res.segments]

        words = []
        if lyrics:
            if feats["lyrics"]:
                progress("lyrics", 0.7)
                from .lyrics import transcribe
                words = transcribe(voice_src, language)
                if not words:
                    warnings.append("Não encontrei voz cantada para transcrever.")
            else:
                warnings.append("Transcrição da letra indisponível no servidor.")

        progress("align", 0.95)
        sheet = to_chordpro(chord_list, words, title=title, key=res.key)
        return {
            "title": title,
            "key": res.key,
            "tempo": round(res.tempo, 1),
            "duration": res.duration,
            "chords": chord_list,
            "words": [asdict(w) for w in words],
            "chordpro": sheet,
            "warnings": warnings,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)
