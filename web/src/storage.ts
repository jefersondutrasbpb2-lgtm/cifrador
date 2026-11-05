/** Armazenamento local (biblioteca, rascunho, preferências). */
export interface Song { id: string; title: string; artist: string; text: string; updated: number }

export const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('cifrador.' + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem('cifrador.' + k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ }
  },
};

export const songs = () => store.get<Song[]>('songs', []);
export const saveSongs = (list: Song[]) => store.set('songs', list);
