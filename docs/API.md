# API and deployment

## Runtime and persistence

The server runs on Node 22.9+; Node 24 LTS is recommended. `npm start` loads `.env` when present. It serves only approved frontend entrypoints/assets and registered MP3 media. Source code, `.env`, catalogue JSON and tooling are not public files.

| Environment variable  | Default     | Meaning                                                                                                        |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `HOST`                | `127.0.0.1` | Listening interface. Keep loopback behind a local proxy.                                                       |
| `PORT`                | `3000`      | TCP port.                                                                                                      |
| `AUDIORA_ADMIN_TOKEN` | unset       | At least 24 non-whitespace characters. Uploads disabled until configured.                                      |
| `MAX_UPLOAD_BYTES`    | `104857600` | Maximum raw MP3 upload size, in bytes.                                                                         |
| `PUBLIC_ORIGIN`       | unset       | Exact public HTTP(S) origin when using a reverse proxy, e.g. `https://audiora.example.com`. No trailing slash. |

Node resolves content directories relative to the project, not the process working directory. Data is stored in a single-process JSON catalogue with serialized mutations, temporary-file replacement and file sync. Directory sync is used where supported; Windows skips POSIX directory fsync. The catalogue has a 16 MiB cap. The in-memory catalogue is loaded once: stop the server before maintenance edits and restart afterwards.

Back up **both** `data/catalog.json` and `media/uploads/` together. The JSON registry associates published episodes with registered media; neither side alone is a complete backup. There is no deletion/editing UI or migration framework.

## Read endpoints

### `GET /api/health`

Returns `{ "status": "ok", "name": "Audiora" }`. This is a process liveness check, not a disk-health/readiness guarantee.

### `GET /api/config`

Returns `uploadsEnabled`, `maxUploadBytes`, and `languages` (objects containing `code`, `name`, `nativeName`). Does not return the publishing token.

### `GET /api/episodes`

Response: `{ "episodes": [ ... ], "total": 12 }` for the initial catalogue.

Optional filters combine with AND:

- `language`: `kn`, `hi`, `en`, or `all`.
- `category`: `Culture`, `Stories`, `Mindfulness`, `Technology`, `Creativity`, `Life`, or `all`.
- `mood`: `Curious`, `Unwind`, `Inspired`, or `all`.
- `q`: Unicode-normalized, case-insensitive search across title, show, host and description, maximum 256 characters. Space-separated terms must all match.

Example: `/api/episodes?language=kn&mood=Unwind`. Invalid filter values and duplicate supported query parameters return 400. The UI loads the complete catalogue once and performs equivalent local filtering; pagination is not implemented.

### `GET /api/episodes/:id`

Response: `{ "episode": { ... } }`, or 404. Read endpoints support HEAD.

## Publication endpoints

Both writes require `Authorization: Bearer <your-private-token>`. Tokens are compared through fixed-length SHA-256 digests using `timingSafeEqual`. No permissive CORS is enabled. Browser mutation requests must be same-origin; `PUBLIC_ORIGIN` supplies the explicit external origin when HTTPS terminates at a proxy. Forwarded host/protocol headers are not trusted. CLI clients without an Origin header still need authorization.

### 1. `POST /api/uploads`

- Body: raw MP3 bytes, **not multipart FormData**.
- `Content-Type: audio/mpeg`.
- `X-Filename: <encodeURIComponent(originalFilename)>`.
- Success 201: `{ "audioUrl": "/media/uploads/<uuid>.mp3" }`.

Checks: filename safety and `.mp3` suffix, MIME type, size, nonempty body and plausible MP3 frame bytes (including an ID3-tag offset). MP3 validation is a structural check, **not complete decoding, malware scanning or transcoding**. Files receive random server-generated names. Partials are removed when an upload is interrupted normally; a process crash can leave a hidden `.part` file for maintenance.

### 2. `POST /api/episodes`

`Content-Type: application/json`. JSON body limit: 64 KiB.

```json
{
  "title": "Your episode title",
  "show": "Your podcast",
  "host": "Your name",
  "description": "What listeners can expect.",
  "language": "kn",
  "category": "Stories",
  "mood": "Curious",
  "duration": 1234.5,
  "audioUrl": "/media/uploads/<uuid-returned-by-upload>.mp3",
  "artwork": "orbit"
}
```

Success 201: `{ "episode": { ... } }`, with a generated ID, timestamp, `demo:false` and `featured:false`. `Location` points to the episode read endpoint.

Text limits: title 160; show 120; host 100; description 2,000 characters. Duration must be a finite number greater than zero and at most 86,400 seconds. It comes from browser metadata and is validated, not independently decoded server-side. Artwork: `orbit`, `sunrise`, `botanical`, `waves`, `city`, `bloom`. Language/category/mood must match the read enums. Unknown metadata properties are rejected. Audio must be a registered, present, local upload; arbitrary URLs are not accepted.

Errors return `{ "error": "A safe, human-readable message." }`. Relevant status codes include 400 invalid input, 401 bad token, 403 origin rejected, 413 body too large, 415 wrong content type, 503 uploads disabled, 507 catalogue full.

Publication is a two-step flow, not a distributed transaction. Failed metadata publication leaves its uploaded MP3 available for a retry. No idempotency key exists: if a request succeeds but the response is lost, inspect Discover before retrying, since a second publication can create another episode. Orphan uploads and crash-leftover temporary files need periodic owner housekeeping, with the server stopped and a backup made first.

## MP3 streaming

`GET /media/audiora-preview.mp3` and registered `/media/uploads/<uuid>.mp3` paths serve `audio/mpeg`. Full requests return 200. Valid single `Range: bytes=start-end` requests return 206 with `Content-Range`. Open-ended and suffix ranges are supported; invalid or multiple ranges return 416. `HEAD` reports full headers without a body and ignores Range. `If-Range` supports a matching Last-Modified date. Byte-range support is useful for long-recording seeking and browser buffering.

## Security boundary and deployment checklist

Implemented: authorisation for writes, disabled-by-default publishing, same-origin restrictions, confined paths, symlink checks, size limits, metadata validation, escaped UI text, no inline scripts, restrictive CSP, no sniffing, anti-framing headers and generic unexpected-error messages. Security headers are safeguards, not an independent security audit.

Before public operation:

1. Use an HTTPS reverse proxy, pin `PUBLIC_ORIGIN`, and retain `Authorization`, `Origin` and `Range` headers. Configure proxy request size and timeout to match the intended upload limit.
2. Apply rate limits, concurrent upload caps, total storage quotas and monitoring. They are **not** built into this small server.
3. Keep the token private, rotate it after disclosure, restrict server filesystem access, and never serve the entire project as a static directory.
4. All registered audio URLs are public. For private or paid content, implement real user authentication and per-request authorisation before launch.
5. Use one Node process per JSON data directory. Multiple replicas require database/object-storage replacement; a load balancer does not make this store multi-process safe.
6. Introduce moderation, copyright/takedown processes and privacy/terms appropriate to your actual service.
7. Back up and test restoration. Review orphan uploads offline. Do not run cleanup against a live publishing process.

Static-only hosts cannot run the backend. Use a maintained Node server with a persistent writable disk, or adapt the storage and API for your deployment platform. No live deployment was performed as part of this package.
