"""Servidor HTTP do Cifrador.

    POST /api/jobs        (multipart: file OU url, lyrics, separate, sevenths, language)
    GET  /api/jobs/{id}   status, etapa, progresso e resultado
    GET  /api/health      recursos disponíveis
"""
from __future__ import annotations

import os
import shutil
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import pipeline
from .features import available

MAX_MB = int(os.environ.get("CIFRADOR_MAX_UPLOAD_MB", "200"))
ORIGINS = [o.strip() for o in os.environ.get("CIFRADOR_CORS", "*").split(",") if o.strip()]

app = FastAPI(title="Cifrador API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=int(os.environ.get("CIFRADOR_WORKERS", "1")))


def _update(job_id: str, **kw):
    with _lock:
        _jobs[job_id].update(kw)


def _work(job_id: str, file_path: Path | None, upload_dir: Path | None, opts: dict):
    _update(job_id, status="running")
    try:
        result = pipeline.run(file_path=file_path, progress=lambda s, p: _update(job_id, step=s, progress=p), **opts)
        _update(job_id, status="done", step="done", progress=1.0, result=result)
    except Exception as exc:  # erro vira mensagem para o app
        _update(job_id, status="error", error=str(exc) or exc.__class__.__name__)
    finally:
        if upload_dir:
            shutil.rmtree(upload_dir, ignore_errors=True)


@app.get("/api/health")
def health():
    return {"ok": True, "features": available()}


@app.post("/api/jobs")
async def create_job(
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
    lyrics: bool = Form(True),
    separate: bool = Form(False),
    sevenths: bool = Form(False),
    language: str = Form("pt"),
):
    if not file and not url:
        raise HTTPException(400, "Envie um arquivo ou um link.")
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(400, "O link precisa começar com http:// ou https://")

    file_path = upload_dir = None
    title = ""
    if file:
        upload_dir = Path(tempfile.mkdtemp(prefix="cifrador-up-"))
        file_path = upload_dir / ("upload" + Path(file.filename or "").suffix[:8])
        size = 0
        with file_path.open("wb") as fh:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_MB << 20:
                    shutil.rmtree(upload_dir, ignore_errors=True)
                    raise HTTPException(413, f"Arquivo maior que {MAX_MB} MB.")
                fh.write(chunk)
        title = Path(file.filename or "").stem

    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "status": "queued", "step": "queued", "progress": 0.0}
    with _lock:
        _jobs[job_id] = job
    opts = dict(url=None if file else url, title=title, lyrics=lyrics, separate=separate,
                sevenths=sevenths, language=language)
    _pool.submit(_work, job_id, file_path, upload_dir, opts)
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Análise não encontrada (o servidor pode ter reiniciado).")
        return dict(job)
