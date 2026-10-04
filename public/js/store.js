const KEY = 'audiora-listening-v1';
const defaults = {
  saved: [],
  queue: [],
  progress: {},
  currentId: null,
  volume: 0.8,
  rate: 1,
  language: 'all',
};
let data = { ...defaults };
let storageAvailable = true;
try {
  const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (stored && typeof stored === 'object') {
    data = { ...defaults, ...stored };
    data.saved = Array.isArray(stored.saved)
      ? [...new Set(stored.saved.filter((id) => typeof id === 'string'))]
      : [];
    data.queue = Array.isArray(stored.queue)
      ? [...new Set(stored.queue.filter((id) => typeof id === 'string'))]
      : [];
    const progress =
      stored.progress && typeof stored.progress === 'object' && !Array.isArray(stored.progress)
        ? stored.progress
        : {};
    data.progress = Object.fromEntries(
      Object.entries(progress).filter(
        ([, value]) =>
          value &&
          Number.isFinite(value.position) &&
          value.position >= 0 &&
          Number.isFinite(value.duration) &&
          value.duration > 0 &&
          value.position <= value.duration &&
          Number.isFinite(value.updatedAt),
      ),
    );
    data.currentId = typeof stored.currentId === 'string' ? stored.currentId : null;
    data.volume = Number.isFinite(stored.volume) ? Math.max(0, Math.min(1, stored.volume)) : 0.8;
    data.rate = [0.75, 1, 1.25, 1.5, 1.75, 2].includes(stored.rate) ? stored.rate : 1;
    data.language = ['all', 'kn', 'hi', 'en'].includes(stored.language) ? stored.language : 'all';
  }
} catch {
  storageAvailable = false;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    storageAvailable = false;
  }
}

export const store = {
  get state() {
    return data;
  },
  get available() {
    return storageAvailable;
  },
  set(key, value, notify = true) {
    data[key] = value;
    persist();
    if (notify) window.dispatchEvent(new CustomEvent('audiora:store', { detail: { key } }));
  },
  toggleSaved(id) {
    const saved = data.saved.includes(id)
      ? data.saved.filter((item) => item !== id)
      : [...data.saved, id];
    this.set('saved', saved);
    return saved.includes(id);
  },
  record(id, position, duration) {
    if (!id || !Number.isFinite(position) || !Number.isFinite(duration)) return;
    data.progress[id] = {
      position,
      duration,
      updatedAt: Date.now(),
      completed: position >= duration - 0.6,
    };
    persist();
  },
};
