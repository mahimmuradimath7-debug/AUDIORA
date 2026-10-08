export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const time = (seconds) =>
  `${Math.floor(Math.max(0, Number(seconds) || 0) / 60)}:${String(Math.floor(Math.max(0, Number(seconds) || 0) % 60)).padStart(2, '0')}`;
export const durationLabel = (seconds) =>
  seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.ceil(seconds / 60)} min`;
export const languageLabel = (code) =>
  ({ kn: 'ಕನ್ನಡ', hi: 'हिन्दी', en: 'English' })[code] || 'English';
export const artwork = (name) => {
  if (name === 'blocked') return '/assets/blocked.jpg';
  if (name && (name.startsWith('/') || name.startsWith('http://') || name.startsWith('https://'))) return name;
  if (name && (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.svg'))) {
    return name.startsWith('/') ? name : `/assets/${name}`;
  }
  return `/assets/${['orbit', 'sunrise', 'botanical', 'waves', 'city', 'bloom'].includes(name) ? name : 'orbit'}.svg`;
};

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response. Please try again.');
  }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

let toastTimer;
export function toast(message) {
  const region = $('#toast-region');
  region.textContent = message;
  region.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.classList.remove('visible'), 3600);
}

export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function setupDialog(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
    if (event.target.closest('[data-close-dialog]')) dialog.close();
  });
}

export function rangeFill(input) {
  const max = Number(input.max) || 1;
  const min = Number(input.min) || 0;
  const value = Math.max(0, Math.min(100, ((Number(input.value) - min) / (max - min)) * 100));
  input.style.setProperty('--range-progress', `${value}%`);
}
