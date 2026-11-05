"""Baixa só o áudio de um link (YouTube e outros sites suportados pelo yt-dlp).

Use para músicas que você tem direito de usar; respeite os termos de cada site.
"""
from __future__ import annotations

from pathlib import Path


def download(url: str, workdir: Path, max_minutes: int = 15) -> tuple[Path, str]:
    import yt_dlp

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(workdir / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "match_filter": yt_dlp.utils.match_filter_func(f"duration <= {max_minutes * 60}"),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    files = sorted(workdir.glob("source.*"))
    if not files:
        raise RuntimeError(f"Não consegui baixar o áudio (vídeos de até {max_minutes} min).")
    return files[0], str(info.get("title") or "")
