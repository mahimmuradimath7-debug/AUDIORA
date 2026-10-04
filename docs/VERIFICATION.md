# Verification record

Verified for this delivery on **4 October 2026**, using **Node 24.19.0**, npm 11.17.0, macOS arm64 and Playwright Chromium 153.0.8010.12. These are actual executed checks, not planned checks.

| Command / check            | Result                                          |
| -------------------------- | ----------------------------------------------- |
| `npm run audio:generate`   | Created the bundled original MP3.               |
| `npm test`                 | **21 passed, 0 failed**.                        |
| `npm run test:ui`          | **13 passed, 0 failed**.                        |
| `npm run format:check`     | All matched source files passed.                |
| `npm audit`                | 0 reported vulnerabilities at the time checked. |
| Live `GET /api/health`     | 200, Audiora status `ok`.                       |
| Desktop/mobile screenshots | Captured and visually reviewed.                 |

## Backend and setup coverage

- Health/config and disabled-by-default publishing; no secrets in read responses.
- Twelve demo episodes, four per language, Unicode search and combined filters.
- Bearer authorization, cross-origin rejection and explicit HTTPS proxy origin support.
- Real upload/publication persistence across a server restart.
- Concurrent mutation serialization without lost records.
- Invalid JSON, malformed UTF-8, unsupported MIME, field limits and oversize streams.
- MP3 structural headers, filename validation, unregistered files and path confinement.
- Exact, suffix, open-ended and invalid ranges; HEAD semantics and If-Range date checks.
- Symlink and traversal rejection; unsupported HTTP methods.
- Interrupted upload cleanup and safe storage-failure messages.
- Malformed catalogues fail safely rather than being reset.
- Setup generates a private token without printing it and refuses to overwrite `.env`.

Backend MP3-boundary tests deliberately use compact structural fixtures. The browser suite supplies the real included MP3 for decoding, playback and upload tests.

## Browser coverage

1. Desktop startup, local assets, no console/runtime errors and no horizontal overflow.
2. Kannada/Hindi/English filtering, native-script search, category/mood filtering and empty-state reset.
3. Bookmark persistence and empty-library guidance.
4. Real MP3 decode/playback, duration near 30 seconds, seek, volume, speed and resume after reload without autoplay.
5. Queue removal and automatic next-episode playback.
6. Focus view and sleep-at-end preventing queue advancement.
7. API-error state and successful retry.
8. Disabled Creator Studio with configuration guidance.
9. Mobile layouts at 390 and 320 CSS pixels; navigation and dialogs fit.
10. Automated WCAG A/AA discovery check with axe.
11. Automated WCAG A/AA checks for mobile discovery and the mobile focus dialog.
12. Invalid local progress recovery and seek-to-zero persistence.
13. Actual studio MP3 upload → publish → reload → search → play, plus safe text rendering.

## Issues found and fixed

- Initial secondary-text contrast was too low. Palette overrides and text sizes were improved; checked discovery/focus states now return no axe violations for the selected WCAG tags.
- Returning playback to zero was not persisted. This is corrected and regression-tested.
- Malformed stored progress could be trusted. Stored values are now checked before use.
- Browser writes behind HTTPS termination required an explicit origin option. `PUBLIC_ORIGIN` is implemented and tested without trusting forwarded headers.

## Limits of this verification

- Chromium viewport emulation is not a substitute for real iOS Safari or Android testing. Firefox, WebKit, Windows and Linux were not exercised.
- Node 24.19 was executed; the documented minimum Node version was not separately exercised.
- Automated accessibility results cover specified states, not every dialog, screen reader or disability. They are not a conformance certification.
- No production deployment, load test, independent security audit, long-recording endurance test, transcription-quality review or native-speaker editorial review was performed.
- No separate compile/build/typecheck exists: this is a no-build JavaScript app. Formatting is checked; a dedicated semantic lint tool is not configured.
- The test data and demo audio do not constitute a real multilingual podcast catalogue. Bring authorised recordings before launch.
