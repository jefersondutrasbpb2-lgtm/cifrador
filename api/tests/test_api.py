import io
import time
import wave

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from tests.synth import C, D, Em, G, synth

client = TestClient(app)


def wav_bytes(y: np.ndarray, sr: int = 22050) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert set(r.json()["features"]) == {"ffmpeg", "youtube", "lyrics", "separate"}


def test_job_completo_com_arquivo():
    data = wav_bytes(synth([G, D, Em, C]))
    r = client.post("/api/jobs", files={"file": ("minha musica.wav", data, "audio/wav")},
                    data={"lyrics": "false"})
    assert r.status_code == 200
    job_id = r.json()["id"]
    for _ in range(120):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.25)
    assert job["status"] == "done", job.get("error")
    res = job["result"]
    assert res["title"] == "minha musica"
    assert [c["label"] for c in res["chords"] if c["label"]] == ["G", "D", "Em", "C"]
    assert "G   D   Em   C" in res["chordpro"]


def test_pedido_sem_arquivo_nem_link():
    assert client.post("/api/jobs", data={"lyrics": "false"}).status_code == 400


def test_link_invalido():
    assert client.post("/api/jobs", data={"url": "file:///etc/passwd"}).status_code == 400
