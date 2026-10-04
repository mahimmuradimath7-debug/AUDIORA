# Audiora implementation contract

## Outcome

A runnable, original, responsive podcast website with a Node.js backend, no production dependencies, local MP3 streaming with byte ranges, discovery in three languages, and protected MP3 uploads. The supplied catalogue is fictional editorial demo content. All seeded entries use a clearly identified, original 30-second ambient MP3; no claim of real Kannada/Hindi/English speech is made. Users replace it with their own recordings in Creator Studio.

## Ownership

- Frontend implementation: `frontend/**` only.
- Backend implementation: `backend/**` and `tests/backend.test.js` only.
- Integration: package scripts, media, tools, documentation, browser tests, ZIP.

## Runtime

Node 22+, ESM. `npm start` starts `backend/server.js`, serving `frontend/` at `/`, `media/` at `/media/`, and API under `/api/`. No build or package install needed to run. Default bind 127.0.0.1, port 3000. Backend exports `createApp(options)` returning an http.Server for ephemeral-port tests. Options: `{ dataDir, mediaDir, frontendDir, adminToken, maxUploadBytes }`; production defaults resolve relative to project, not working directory. Never serve data, .env, tools or source directories.

## Catalogue model

Episode fields: `id`, `title`, `show`, `host`, `description`, `language` (`kn` | `hi` | `en`), `category` (`Culture` | `Stories` | `Mindfulness` | `Technology` | `Creativity` | `Life`), `mood` (`Curious` | `Unwind` | `Inspired`), `duration` (seconds, 30 for demo), `audioUrl`, `artwork` (one of `orbit`, `sunrise`, `botanical`, `waves`, `city`, `bloom`), `publishedAt` (ISO), `featured` (boolean), `demo` (boolean).

Seed 12 original fictional entries, four per language, using `/media/audiora-preview.mp3`. Mix native-script titles and English translations in description. Featured episode first, English, title `The art of slowing down`, show `The Quiet Hours`, artwork `orbit`. Do not fabricate listeners, ratings, popularity statistics or podcast hosts' real endorsements.

## Read API

- `GET /api/health` => `{ status: 'ok', name: 'Audiora' }`.
- `GET /api/config` => `{ uploadsEnabled: boolean, maxUploadBytes: number, languages: [{ code, name, nativeName }] }`.
- `GET /api/episodes?language=kn&category=Culture&mood=Curious&q=...` => `{ episodes: [...], total: number }`; omitted or `all` filters ignored. Unicode-aware case-insensitive search across title/show/host/description. Unknown language/category/mood => 400.
- `GET /api/episodes/:id` => `{ episode: {...} }` or 404.
- Error contract: `{ error: 'Human readable safe message' }` with appropriate HTTP status.

## MP3 publication (two steps)

Authorization for writes: `Authorization: Bearer <AUDIORA_ADMIN_TOKEN>`. Disabled with 503 unless configured to 24+ characters. Frontend asks for token via password input, holds it only in memory and never persists it. Avoid logging tokens. Origin checks reject clearly cross-origin mutation requests. Do not enable permissive CORS.

1. `POST /api/uploads`, raw file body, `Content-Type: audio/mpeg`, `X-Filename: encodeURIComponent(file.name)` => 201 `{ audioUrl: '/media/uploads/<uuid>.mp3' }`. Validate .mp3 extension, MIME type, size limit, and plausible MP3 frame/ID3 bytes. Stream to random temp file, avoid path traversal, clean partial failures. Never accept SVG/HTML uploads. This is lightweight MP3 validation, not an antivirus/transcoder.
2. `POST /api/episodes`, JSON `{ title, show, host, description, language, category, mood, duration, audioUrl, artwork }` => 201 `{ episode }`. Validate lengths/enums/duration and ensure audioUrl is a previously stored local upload, no external URLs or filesystem references. User entries default `demo:false`, `featured:false`. Persist with serialized atomic JSON writes and reread on restart. Duration comes from browser media metadata, must be finite > 0. Failed publication leaves an unreferenced upload; document storage housekeeping.

## Frontend acceptance

Premium editorial visual identity: warm ivory canvas, charcoal navigation, vibrant violet accent, sophisticated oversized type and original graphic covers; not a Spotify clone. Visible three-language selection, responsive discover grid, search, category/mood controls, saved local library, continue listening, queue, player with pause/play, seek, +/-15 seconds, rate and volume, sleep timer, immersive focus view, persistent preferences/progress. Use localStorage safely with failure fallback and explain device-local state. Accessible controls, focus rings, Escape-dismissable native dialogs, keyboard-safe shortcuts, reduced-motion support. Show loading, empty, upload-disabled, playback-error and API-failure states. No inert buttons or fabricated social metrics. Clearly label demo audio. Creator upload form follows the two-step API exactly and computes MP3 duration with an audio object.

## Asset paths

Frontend owns graphics in `/assets/`. Artwork mapping should use `/assets/<artwork>.svg`. Main integration provides `/media/audiora-preview.mp3`. No required external image/font requests, trackers, services or API keys.
