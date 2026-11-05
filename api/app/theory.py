"""Nomes de notas e perfis de tonalidade."""
from __future__ import annotations

import numpy as np

SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
FLAT_MAJ = {5, 10, 3, 8, 1, 6}
FLAT_MIN = {2, 7, 0, 5, 10, 3}

KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def prefers_flats(tonic: int, minor: bool) -> bool:
    return tonic % 12 in (FLAT_MIN if minor else FLAT_MAJ)


def note(pc: int, flats: bool = False) -> str:
    return (FLAT if flats else SHARP)[pc % 12]


def key_name(tonic: int, minor: bool) -> str:
    return note(tonic, prefers_flats(tonic, minor)) + ("m" if minor else "")


def estimate_key(chroma_sum: np.ndarray) -> tuple[int, bool]:
    """Correlação de Pearson com os perfis de Krumhansl-Kessler."""
    best = (-2.0, 0, False)
    for t in range(12):
        rot = np.roll(chroma_sum, -t)
        for minor, prof in ((False, KK_MAJ), (True, KK_MIN)):
            r = float(np.corrcoef(rot, prof)[0, 1])
            if np.isfinite(r) and r > best[0]:
                best = (r, t, minor)
    return best[1], best[2]


def diatonic(tonic: int, minor: bool) -> tuple[set[int], set[int]]:
    """(raízes de acordes maiores, raízes de acordes menores) da tonalidade."""
    t = (tonic + 3) % 12 if minor else tonic
    return {t, (t + 5) % 12, (t + 7) % 12}, {(t + 2) % 12, (t + 4) % 12, (t + 9) % 12}


def estimate_key_from_chords(chords: list[tuple[int, bool, float]]) -> tuple[int, bool] | None:
    """chords: (raiz, menor?, duração). Pontua cada tom pelos acordes diatônicos."""
    if not chords:
        return None
    total = sum(d for _, _, d in chords) or 1.0
    best = None
    for t in range(12):
        for minor in (False, True):
            dmaj, dmin = diatonic(t, minor)
            s = 0.0
            for i, (r, is_min, d) in enumerate(chords):
                w = d / total
                if r in (dmin if is_min else dmaj):
                    s += w
                if r == t and is_min == minor:
                    s += w * 0.6 + (0.15 if i in (0, len(chords) - 1) else 0)
                if minor and not is_min and r == (t + 7) % 12:
                    s += w * 0.4  # dominante maior no tom menor
            if best is None or s > best[0]:
                best = (s, t, minor)
    return best[1], best[2]
