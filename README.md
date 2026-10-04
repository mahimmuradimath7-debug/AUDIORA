# Audiora

**Find your frequency.** An original, responsive podcast website for **Kannada / ಕನ್ನಡ, Hindi / हिन्दी, and English**.

A complete local frontend + backend implementation, not just a landing-page mockup. Warm ivory, charcoal and violet styling; original orbital artwork; a persistent audio player; and a protected Creator Studio for your own MP3s.

> **Demo content:** the 12 seeded episode concepts are fictional. Every seed plays the same original 30-second ambient composition, **not spoken Kannada, Hindi or English**. Upload your recordings to publish real episodes. The interface is English with native-script titles and content-language filters, not a fully translated UI.

## Start in one command

1. Extract the ZIP.
2. Install **Node.js 24 LTS** (minimum supported version: 22.9).
3. Open a terminal inside the extracted `audiora` folder:

```sh
npm start
```

4. Visit **http://localhost:3000**.

**No `npm install`, database setup, API keys, or build step is required to run the website.** All production code uses browser APIs and Node built-ins. Opening `frontend/index.html` directly will not work: the backend serves the app and MP3 files together.

If port 3000 is occupied, create `.env` from `.env.example`, change `PORT`, and restart. `Ctrl+C` stops the server. `npm run dev` restarts it on backend file changes; refresh the browser for frontend changes.

## Publish your own podcasts

Run this once from the project folder:

```sh
npm run setup
```

This creates a private `.env` with a securely generated publishing token. It refuses to overwrite an existing `.env`, and never prints the token. Alternatively, copy `.env.example` to `.env` and set `AUDIORA_ADMIN_TOKEN` to a unique, random value of at least 24 characters without spaces.

1. Restart `npm start` after changing `.env`.
2. Open **Creator Studio** (on mobile: **Create**).
3. Choose a valid `.mp3` file. Default maximum size: **100 MiB**.
4. Enter episode title, show name, creator, description, language, category and mood. Choose one of the original covers.
5. Copy the token privately from your local `.env` into the studio’s password field.
6. Click **Publish episode**. Search for the title in Discover, or select its language and play it.

The browser reads the actual audio duration, uploads the binary MP3, then publishes its metadata. Files are stored in `media/uploads/`; published metadata and the upload registry are in `data/catalog.json`. They survive a server restart. Tokens stay in page memory, are cleared when the dialog closes, and are never saved in browser storage.

Only the server owner or trusted creators should know this token. It is a simple single-administrator publishing model, **not a multi-user authentication system**. Published uploads are publicly listenable. Upload only audio you have the rights to publish.

## What works

- Equal-visibility Kannada, Hindi and English discovery; Unicode-aware search.
- Six categories and three mood filters: Curious, Unwind, Inspired.
- Saved library, listening history, resume position and queue stored on this device.
- MP3 play/pause, seeking, skip ±15 seconds, 0.75×–2× speed, volume and mute.
- Persistent player while browsing; automatic next-in-queue; queue removal.
- Focus listening dialog and sleep timer, including end-of-episode mode.
- Keyboard shortcuts, focus indicators, reduced-motion support and native dialogs.
- Responsive layouts, with mobile bottom navigation and touch-accessible controls.
- Creator publishing with validation and understandable failure messages.
- Real streaming API with byte-range support for seekable MP3 playback.
- Honest loading, empty, API-failure, disabled-publishing and playback-error states.

Keyboard shortcuts: **Space/K** play/pause, **←/→** skip 15 seconds, **M** mute, **/** search, **?** help, **Esc** close a dialog. Inputs and focused controls keep their normal keyboard behaviour.

## Project map

| Path                        | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `frontend/index.html`       | Application shell and accessible navigation              |
| `frontend/js/app.js`        | Discovery, filters, cards, library and details           |
| `frontend/js/player.js`     | Audio, queue, resume, sleep and focus mode               |
| `frontend/js/studio.js`     | MP3 upload and publication flow                          |
| `frontend/js/store.js`      | Validated device-local listening state                   |
| `frontend/*.css`            | Visual design, dialogs, player, responsiveness, contrast |
| `frontend/assets/`          | Original SVG logo, hero and six episode covers           |
| `backend/server.js`         | HTTP routing, authentication, origin checks and headers  |
| `backend/files.js`          | Confined file access, uploads and streaming ranges       |
| `backend/store.js`          | Serialized, atomic local JSON persistence                |
| `backend/validation.js`     | Input, metadata, filename and MP3-header checks          |
| `backend/catalogue.js`      | Fictional seed catalogue and language definitions        |
| `media/audiora-preview.mp3` | Included original ambient audio                          |
| `tools/`                    | Optional setup and demo-audio generation utilities       |
| `tests/`                    | Backend and real-browser regression tests                |
| `docs/DESIGN-ANALYSIS.md`   | Source-backed competitor analysis and design rationale   |
| `docs/API.md`               | Endpoint and deployment notes                            |
| `docs/VERIFICATION.md`      | Actual checks and remaining limitations                  |

Desktop and mobile screenshots are in `docs/preview-desktop.png` and `docs/preview-mobile.png`.

## Development and tests

Backend tests use only Node built-ins:

```sh
npm test
```

Browser tests and formatting use optional development dependencies:

```sh
npm ci
npx playwright install chromium
npm run test:ui
npm run format:check
```

Browser tests create an isolated temporary catalogue and randomly generated test token. They do not modify your real uploads. Screenshots are regenerated in `docs/`. `npm run format` formats source files. The included MP3 can be regenerated with `npm run audio:generate` after installing development dependencies; the site does not need its encoder at runtime.

## Customise

- Brand text and structure: `frontend/index.html`.
- Colours and typography: CSS variables at the start of `frontend/styles.css`; contrast overrides are in `frontend/accessibility.css`.
- Original graphics: `frontend/assets/*.svg`. Keep the existing filenames or update the artwork mapping.
- Demo catalogue: `backend/catalogue.js`. Remove demo seeds there once you have your own recordings. Back up your catalogue before changing its schema.
- Categories, moods and languages: update the frontend controls and `backend/validation.js` together.

## Before putting it on the internet

This is a polished **single-server, small-catalogue foundation**, not an audited, high-scale streaming platform. See [API and deployment notes](docs/API.md) before launch.

- Use HTTPS and a maintained reverse proxy. Set `PUBLIC_ORIGIN` to your exact HTTPS origin without a trailing slash.
- Keep Node bound to loopback behind that proxy; protect server files and keep `.env` private.
- Add rate limiting, storage quotas, monitoring, backups and content moderation before inviting external publishers.
- For multiple servers, replace the JSON store with a transactional database and MP3 storage with an object store/CDN.
- Native-device testing in Safari/iOS, Android and Firefox is still needed. Automated mobile checks use Chromium viewport emulation.
- There are no payments, public signup, RSS ingestion, offline downloads, cloud sync, automatic transcription or machine-learning recommendations. These are not represented by non-working buttons.

No analytics or external assets are required. Browser-local history is not a cloud account. Clearing site data removes saved episodes and progress. Sleep timers need the tab/browser to remain running and can be delayed by device sleep.
