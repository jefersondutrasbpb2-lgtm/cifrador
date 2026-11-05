from app.align import Word, split_lines, to_chordpro


def words(text: str, start: float, step: float = 0.4):
    out = []
    for i, w in enumerate(text.split()):
        out.append(Word((" " if i else "") + w, start + i * step, start + i * step + step * 0.9))
    return out


def test_acordes_na_silaba_certa():
    ws = words("O café na mesa o sol pela janela", 2.0)  # "mesa" começa em 3.2
    chords = [
        {"start": 0.0, "end": 3.2, "label": "G"},
        {"start": 3.2, "end": 6.0, "label": "D/F#"},
    ]
    out = to_chordpro(chords, ws, title="Teste", key="G")
    assert out.splitlines()[:3] == ["{t: Teste}", "{key: G}", ""]
    assert "[Intro]" in out
    assert "[G]O café na [D/F#]mesa o sol pela janela" in out


def test_linha_comeca_com_acorde_que_esta_soando():
    ws = words("primeira linha aqui", 1.0) + words("segunda linha", 3.0)
    chords = [{"start": 0.0, "end": 10.0, "label": "Am"}]
    lines = to_chordpro(chords, ws).splitlines()
    assert "[Am]primeira linha aqui" in lines
    assert "[Am]segunda linha" in lines


def test_instrumental_e_final():
    ws = words("canta um verso", 1.0) + words("volta a letra", 12.0)
    chords = [
        {"start": 0.0, "end": 5.0, "label": "C"},
        {"start": 5.0, "end": 8.0, "label": "F"},
        {"start": 8.0, "end": 12.0, "label": "G"},
        {"start": 12.0, "end": 14.0, "label": "C"},
        {"start": 14.0, "end": 16.0, "label": "G"},
    ]
    out = to_chordpro(chords, ws)
    assert "[Instrumental]\nF   G" in out
    assert out.rstrip().endswith("[Final]\nG")


def test_sem_letra_vira_grade_de_acordes():
    chords = [{"start": i, "end": i + 1, "label": lab} for i, lab in enumerate("G D Em C G".split())]
    assert to_chordpro(chords, []) == "[Acordes]\nG   D   Em   C\nG\n"


def test_quebra_versos_por_pausa():
    ws = words("um dois tres", 0.0) + words("quatro cinco", 3.0)
    assert [len(line.words) for line in split_lines(ws)] == [3, 2]
