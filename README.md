# Cifrador

Monte cifras para **violão** e **teclado**: cole uma cifra de qualquer site, transponha o tom, use capotraste, veja o desenho de cada acorde e deixe a tela rolando sozinha enquanto toca. Ou tire os acordes direto de um **áudio, vídeo ou link do YouTube**, com a letra transcrita e cada acorde em cima da sílaba certa.

```
cifrador/
├── web/   app no navegador (instalável no celular). Funciona sozinho, sem servidor.
└── api/   servidor de análise em Python (opcional): YouTube, letra (Whisper) e separação de instrumentos (Demucs).
```

## O que já faz

**App web (`web/`)**
- Lê cifra no formato "acordes em cima da letra" (o que vem de qualquer site) e **ChordPro** (`[G]O café na [D]mesa`).
- Entende a notação brasileira: `G7M`, `Am7(b5)`, `C7(9)`, `C7/9`, `D4`, `C9` (= add9), `B°`, `D/F#`.
- Transpõe meio tom por vez sem desalinhar a letra; sustenidos ou bemóis automáticos pelo tom.
- **Violão:** desenho de cada acorde gerado para qualquer acorde (formas abertas, pestana, várias posições com ‹ ›), capotraste e sugestão de capo que deixa a música mais fácil.
- **Teclado:** notas do acorde no teclado, com o baixo destacado.
- Rolagem automática (mantém a tela ligada), tamanho da letra, biblioteca local, abrir arquivos `.txt`/`.cho`, copiar no tom atual.
- **Acordes de áudio/vídeo no próprio navegador:** nada sai do aparelho. Player com acorde atual, próximo e desenho; corrija tocando junto e envie para a cifra.
- Conecta no servidor (`api/`) quando você quiser mais precisão, link do YouTube e a letra.

**Servidor (`api/`)**
- Acordes sincronizados com a batida da música (CQT + Viterbi), tom estimado pelos acordes, sétimas opcionais.
- Link do YouTube e outros sites com `yt-dlp`.
- Letra com tempo de cada palavra via `faster-whisper`, e montagem automática da cifra em ChordPro com `[Intro]`, `[Instrumental]` e `[Final]`.
- Separação de voz e instrumentos com `Demucs` antes da análise (mais lento, mais preciso).

## Rodar no computador

### App web
```bash
cd web
npm install
npm run dev
```
Abra o endereço que aparecer (normalmente http://localhost:5173).

### Servidor (opcional)
Precisa de Python 3.10+ e `ffmpeg`.

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Para YouTube, letra e separação de instrumentos, instale o pacote completo (baixa o PyTorch, alguns GB):

```bash
pip install -r requirements-full.txt
```

Ou com Docker, já com tudo:

```bash
docker compose up --build
```

No app, abra **Do áudio ou vídeo → Servidor de análise**, coloque `http://localhost:8000` e toque em **Conectar**.

Configurações do servidor (variáveis de ambiente):

| Variável | Padrão | Para que serve |
|---|---|---|
| `CIFRADOR_CORS` | `*` | De quais sites o app pode chamar o servidor (separe por vírgula) |
| `CIFRADOR_WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`, `large-v3`. Maior = mais preciso e mais lento |
| `CIFRADOR_WHISPER_DEVICE` | `auto` | `cpu` ou `cuda` |
| `CIFRADOR_MAX_UPLOAD_MB` | `200` | Tamanho máximo do arquivo |
| `CIFRADOR_WORKERS` | `1` | Quantas análises ao mesmo tempo |

## Testes

```bash
cd web && npm test
```

```bash
cd api && pip install -r requirements-dev.txt && python -m pytest
```

O CI roda os dois a cada push (`.github/workflows/ci.yml`).

## Publicar

- **App web no GitHub Pages:** o workflow `pages.yml` publica a cada push na `main`. Ative uma vez em *Settings → Pages → Source: GitHub Actions*. Também funciona em Vercel ou Netlify (pasta `web`, comando `npm run build`, saída `dist`).
- **Servidor:** qualquer lugar que rode Docker (Render, Fly.io, Railway, um PC em casa). Whisper e Demucs ficam bem mais rápidos com GPU. Para o app publicado em `https://` conseguir chamar o servidor, ele também precisa estar em `https://`.

## Como a cifra com letra é montada

1. O áudio vira um cromagrama (energia de cada uma das 12 notas) sincronizado com as batidas.
2. Cada trecho é comparado com modelos de acordes; o Viterbi escolhe a sequência mais provável, com custo para trocar de acorde.
3. O tom é estimado pelos acordes encontrados e uma segunda passada favorece os acordes do tom.
4. O Whisper transcreve a letra com o tempo de cada palavra.
5. Cada acorde entra na palavra que está sendo cantada quando ele começa; toda linha começa com o acorde que está soando; trechos sem voz viram linhas só de acordes.

O resultado é um ponto de partida muito bom, mas acordes com tensões (9ª, 11ª, 13ª), inversões e harmonias de bossa nova ainda pedem revisão de ouvido. O app foi feito para corrigir rápido tocando junto.

## Direitos autorais

Use o download de links e a transcrição para músicas que você tem direito de usar e para estudo pessoal, e respeite os termos dos sites. Não publique letras de terceiros sem autorização.

## Próximos passos

- [ ] Sincronizar a biblioteca na nuvem (Supabase) para usar no celular e no computador.
- [ ] Modelo de acordes treinado (mais qualidades de acorde e inversões).
- [ ] Modo show: lista de músicas em sequência com troca por pedal Bluetooth.
- [ ] App nativo com Expo, reaproveitando `web/src/music`.
