"""
Junta acordes (com tempo) e palavras da letra (com tempo) numa cifra ChordPro:

    [G]O café na [D/F#]mesa, o sol pela ja[Em]nela

Regras:
- cada acorde vai na palavra que está sendo cantada quando ele entra
  (ou na próxima, se ele entra numa pausa curta);
- toda linha começa mostrando o acorde que está soando;
- acordes em trechos sem voz viram linhas só de acordes ([Intro], [Solo], [Final]).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Word:
    word: str
    start: float
    end: float


@dataclass
class Lyric:
    words: list[Word] = field(default_factory=list)

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end


def split_lines(words: list[Word], *, max_words: int = 10, pause: float = 0.7) -> list[Lyric]:
    """Quebra a letra em versos por pausas, pontuação e tamanho."""
    lines: list[Lyric] = []
    cur = Lyric()
    for w in words:
        if cur.words:
            gap = w.start - cur.words[-1].end
            ends_phrase = cur.words[-1].word.strip()[-1:] in ".!?;"
            if gap > pause or len(cur.words) >= max_words or (ends_phrase and len(cur.words) >= 3):
                lines.append(cur)
                cur = Lyric()
        cur.words.append(w)
    if cur.words:
        lines.append(cur)
    return lines


def _chord_line(labels: list[str]) -> str:
    return "   ".join(labels)


def to_chordpro(chords: list[dict], words: list[Word], *, title: str = "", key: str = "",
                lead: float = 0.25) -> str:
    """chords: [{start, end, label}] (label vazio = sem acorde)."""
    ch = [c for c in chords if c["label"]]
    out: list[str] = []
    if title:
        out.append(f"{{t: {title}}}")
    if key:
        out.append(f"{{key: {key}}}")
    if out:
        out.append("")

    if not words:
        out.append("[Acordes]")
        for i in range(0, len(ch), 4):
            out.append(_chord_line([c["label"] for c in ch[i:i + 4]]))
        return "\n".join(out).rstrip() + "\n"

    lines = split_lines(words)
    ci = 0  # próximo acorde ainda não usado

    def sounding(t: float) -> str | None:
        for c in ch:
            if c["start"] <= t < c["end"]:
                return c["label"]
        return None

    def instrumental(until: float, label: str):
        nonlocal ci
        labs: list[str] = []
        while ci < len(ch) and ch[ci]["start"] < until - lead:
            labs.append(ch[ci]["label"])
            ci += 1
        if labs:
            out.append(f"[{label}]")
            for i in range(0, len(labs), 4):
                out.append(_chord_line(labs[i:i + 4]))
            out.append("")

    prev_end = 0.0
    for li, line in enumerate(lines):
        if li == 0:
            instrumental(line.start, "Intro")
        elif line.start - prev_end > 4.0:
            instrumental(line.start, "Instrumental")
        elif line.start - prev_end > 2.0:
            out.append("")
        # acordes que caem dentro deste verso
        marks: dict[int, list[str]] = {}
        while ci < len(ch) and ch[ci]["start"] < line.end:
            t = ch[ci]["start"]
            wi = next((i for i, w in enumerate(line.words) if w.end > t + lead), len(line.words) - 1)
            if t < line.start - lead:  # entrou antes do verso: fica no começo
                wi = 0
            marks.setdefault(wi, []).append(ch[ci]["label"])
            ci += 1
        if 0 not in marks:
            s = sounding(line.start)
            if s:
                marks[0] = [s]
        text = ""
        for i, w in enumerate(line.words):
            piece = w.word if i else w.word.lstrip()
            if i in marks:
                lead_space = piece[: len(piece) - len(piece.lstrip())]
                piece = lead_space + "".join(f"[{c}]" for c in marks[i]) + piece.lstrip()
            text += piece
        out.append(text.strip())
        prev_end = line.end

    if ci < len(ch):
        out.append("")
        instrumental(float("inf"), "Final")
    return "\n".join(out).rstrip() + "\n"
