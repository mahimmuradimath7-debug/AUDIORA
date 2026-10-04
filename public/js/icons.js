const paths = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke-linejoin="round"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"/>',
  shuffle:
    '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 4-3 5-6s4-6 7-6h3m-4-4 4 4-4 4"/>',
  back15:
    '<path d="M5 8a8 8 0 1 1-1 9M5 3v5h5"/><text x="7" y="16" fill="currentColor" stroke="none" font-size="8" font-weight="700" font-family="sans-serif">15</text>',
  forward15:
    '<path d="M19 8a8 8 0 1 0 1 9m-1-14v5h-5"/><text x="7" y="16" fill="currentColor" stroke="none" font-size="8" font-weight="700" font-family="sans-serif">15</text>',
  next: '<path d="m5 6 10 6-10 6Z" fill="currentColor"/><path d="M19 5v14"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3Zm13 0 5 6m-5 0 5-6"/>',
  queue: '<path d="M3 5h16M3 11h12M3 17h8m8-3v8m-4-4h8"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  headphones:
    '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  refresh: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
  });
}
