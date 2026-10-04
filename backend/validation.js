import { ARTWORKS, CATEGORIES, LANGUAGES, MOODS } from './catalogue.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const UPLOAD_URL = new RegExp(`^/media/uploads/(${UUID_PATTERN}\\.(?:mp3|m4a))$`);
const languages = LANGUAGES.map(({ code }) => code);
const metadataFields = new Set([
  'title',
  'show',
  'host',
  'description',
  'language',
  'category',
  'mood',
  'duration',
  'audioUrl',
  'artwork',
]);

function text(value, field, max) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new HttpError(400, `${field} must be non-empty text of at most ${max} characters.`);
  }
  return value.trim();
}

function choice(value, allowed, field) {
  if (!allowed.includes(value)) throw new HttpError(400, `Choose a supported ${field}.`);
  return value;
}

export function validateEpisode(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Episode metadata must be a JSON object.');
  }
  if (Object.keys(input).some((key) => !metadataFields.has(key))) {
    throw new HttpError(400, 'Episode metadata contains an unsupported field.');
  }
  const result = {
    title: text(input.title, 'Title', 160),
    show: text(input.show, 'Show', 120),
    host: text(input.host, 'Host', 100),
    description: text(input.description, 'Description', 2000),
    language: choice(input.language, languages, 'language'),
    category: choice(input.category, CATEGORIES, 'category'),
    mood: choice(input.mood, MOODS, 'mood'),
    artwork: choice(input.artwork, ARTWORKS, 'artwork'),
  };
  if (
    typeof input.duration !== 'number' ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    input.duration > 86400
  ) {
    throw new HttpError(
      400,
      'Duration must be a number greater than zero and no longer than 24 hours.',
    );
  }
  if (typeof input.audioUrl !== 'string' || !UPLOAD_URL.test(input.audioUrl)) {
    throw new HttpError(400, 'Choose a local MP3 or M4A uploaded through Creator Studio.');
  }
  return { ...result, duration: input.duration, audioUrl: input.audioUrl };
}

export function parseFilters(searchParams) {
  const result = {};
  for (const [field, allowed] of [
    ['language', languages],
    ['category', CATEGORIES],
    ['mood', MOODS],
  ]) {
    if (searchParams.getAll(field).length > 1)
      throw new HttpError(400, `Specify ${field} only once.`);
    const value = searchParams.get(field);
    if (value === null || value === 'all') continue;
    result[field] = choice(value, allowed, field);
  }
  if (searchParams.getAll('q').length > 1)
    throw new HttpError(400, 'Specify a search query only once.');
  const query = searchParams.get('q') || '';
  if (query.length > 256)
    throw new HttpError(400, 'Search queries may contain at most 256 characters.');
  result.query = normalize(query.trim());
  return result;
}

function normalize(value) {
  return value.normalize('NFKC').toLowerCase();
}

export function filterEpisodes(episodes, filters) {
  return episodes.filter((episode) => {
    for (const field of ['language', 'category', 'mood']) {
      if (filters[field] && episode[field] !== filters[field]) return false;
    }
    if (!filters.query) return true;
    const searchable = normalize(
      [episode.title, episode.show, episode.host, episode.description].join(' '),
    );
    return filters.query.split(/\s+/u).every((term) => searchable.includes(term));
  });
}

export function validateFilename(header) {
  let name;
  try {
    name = decodeURIComponent(header || '');
  } catch {
    throw new HttpError(400, 'X-Filename must be a URL-encoded audio filename.');
  }
  if (
    !name ||
    name.length > 240 ||
    /[/\\\u0000-\u001f\u007f]/u.test(name) ||
    name.startsWith('.') ||
    !/\.(?:mp3|m4a)$/i.test(name)
  ) {
    throw new HttpError(400, 'Provide a plain .mp3 or .m4a filename in X-Filename.');
  }
}

export function mp3FrameOffset(prefix, totalBytes) {
  if (prefix[0] === 0x49 && prefix[1] === 0x44 && prefix[2] === 0x33) {
    if (prefix.length < 10) return null;
    const version = prefix[3];
    const flagsMask = version === 2 ? 0xc0 : version === 3 ? 0xe0 : 0xf0;
    if (version < 2 || version > 4 || prefix[4] === 0xff || (prefix[5] & ~flagsMask) !== 0)
      return null;
    if ([...prefix.subarray(6, 10)].some((byte) => byte > 127)) return null;
    const tagLength = prefix[6] * 2 ** 21 + prefix[7] * 2 ** 14 + prefix[8] * 2 ** 7 + prefix[9];
    const offset = 10 + tagLength + (version === 4 && prefix[5] & 0x10 ? 10 : 0);
    return totalBytes >= offset + 4 ? offset : null;
  }
  return 0;
}

export function plausibleMp3(prefix, totalBytes) {
  if (prefix.length < 4) return false;
  const [first, second, third, fourth] = prefix;
  const valid =
    first === 0xff &&
    (second & 0xe0) === 0xe0 &&
    ((second >> 3) & 3) !== 1 &&
    ((second >> 1) & 3) === 1 &&
    third >> 4 !== 0 &&
    third >> 4 !== 15 &&
    ((third >> 2) & 3) !== 3 &&
    (fourth & 3) !== 2;
  if (!valid) return false;
  const version = (second >> 3) & 3;
  const rates =
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate =
    [44100, 48000, 32000][(third >> 2) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const frameLength =
    Math.floor(((version === 3 ? 144 : 72) * rates[third >> 4] * 1000) / sampleRate) +
    ((third >> 1) & 1);
  return totalBytes >= frameLength;
}

export function plausibleM4a(prefix, totalBytes) {
  if (prefix.length < 8 || totalBytes < 16) return false;
  const boxLength = prefix.readUInt32BE(0);
  const boxType = prefix.subarray(4, 8).toString('latin1');
  if (boxLength !== 1 && (boxLength < 8 || boxLength > totalBytes)) return false;
  if (boxType === 'ftyp') {
    if (prefix.length >= 12) {
      const majorBrand = prefix.subarray(8, 12).toString('latin1');
      return /^[\x20-\x7E]{4}$/.test(majorBrand);
    }
    return true;
  }
  return ['wide', 'free', 'skip'].includes(boxType);
}
