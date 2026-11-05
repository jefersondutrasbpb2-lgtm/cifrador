# docker build -t cifrador-api api/                       (só acordes, leve)
# docker build -t cifrador-api --build-arg FULL=1 api/    (+ YouTube, letra e separação)
FROM python:3.12-slim

ARG FULL=0
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt requirements-full.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && if [ "$FULL" = "1" ]; then pip install --no-cache-dir -r requirements-full.txt; fi

COPY app ./app
ENV CIFRADOR_CORS="*" CIFRADOR_WHISPER_MODEL=small
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
