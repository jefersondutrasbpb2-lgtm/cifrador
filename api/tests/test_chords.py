from app.chords import analyze
from tests.synth import Am, C, D, E, Em, F, G, synth


def labels(res):
    return [s.label for s in res.segments if s.label]


def test_progressao_maior():
    res = analyze(synth([G, D, Em, C, G, D, Em, C]))
    assert labels(res) == ["G", "D", "Em", "C", "G", "D", "Em", "C"]
    assert res.key == "G"
    assert abs(res.segments[1].start - 2.0) < 0.4


def test_progressao_menor():
    res = analyze(synth([Am, F, E, Am]))
    assert labels(res) == ["Am", "F", "E", "Am"]
    assert res.key == "Am"
