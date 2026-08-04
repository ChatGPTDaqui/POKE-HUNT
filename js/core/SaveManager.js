const SAVE_KEY = 'novo-poke-idle:save';
const SAVE_VERSION = 1;

export const SaveManager = {
  save(stateSnapshot) {
    const payload = { version: SAVE_VERSION, data: stateSnapshot, savedAt: Date.now() };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('Falha ao salvar jogo:', err);
      return false;
    }
  },

  // Returns { data, savedAt } so callers can tell how long ago the save
  // happened (used by the Farm Offline system to know how much real time to
  // simulate) — null if there's no usable save.
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (payload.version !== SAVE_VERSION) {
        console.warn('Save de versao antiga descartado.');
        return null;
      }
      return { data: payload.data, savedAt: payload.savedAt || null };
    } catch (err) {
      console.warn('Falha ao carregar save:', err);
      return null;
    }
  },

  clear() {
    localStorage.removeItem(SAVE_KEY);
  },
};
