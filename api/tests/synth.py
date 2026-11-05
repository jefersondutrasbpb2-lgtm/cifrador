import numpy as np


def synth(prog: list[list[int]], dur: float = 2.0, sr: int = 22050) -> np.ndarray:
    """Acordes sintéticos com harmônicos e ataque a cada meio segundo."""
    n = int(sr * dur)
    t = np.arange(n) / sr
    env = np.exp(-3 * (t % 0.5))
    out = []
    for notes in prog:
        s = np.zeros(n)
        for m in notes:
            f = 440 * 2 ** ((m - 69) / 12)
            for h in range(1, 6):
                s += np.sin(2 * np.pi * f * h * t) / h**2
        out.append(s * env * 0.1)
    return np.concatenate(out).astype(np.float32)


G, D, Em, C = [43, 59, 62, 67], [38, 57, 62, 66], [40, 59, 64, 67], [36, 60, 64, 67]
Am, F, E = [45, 60, 64, 69], [41, 60, 65, 69], [40, 59, 64, 68]
