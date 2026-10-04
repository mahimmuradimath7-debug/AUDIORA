import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { LANGUAGES } from './catalogue.js';
import { createStore } from './store.js';
import { serveFile, storeUpload, verifyUploadFile } from './files.js';
import {
  HttpError,
  UPLOAD_URL,
  filterEpisodes,
  parseFilters,
  validateEpisode,
} from './validation.js';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const JSON_LIMIT = 64 * 1024;
const DEFAULT_UPLOAD_LIMIT = 100 * 1024 * 1024;
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const staticTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

function sendJson(req, res, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', encoded.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(req.method === 'HEAD' ? undefined : encoded);
}

function pathnameOf(req) {
  if (!req.url || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.length > 4096) {
    throw new HttpError(req.url?.length > 4096 ? 414 : 400, 'Invalid request URL.');
  }
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?', 1)[0]);
  } catch {
    throw new HttpError(400, 'Invalid URL encoding.');
  }
  if (
    /[\\\u0000-\u001f\u007f]/u.test(pathname) ||
    pathname.startsWith('//') ||
    pathname.split('/').some((segment) => segment.startsWith('.'))
  ) {
    throw new HttpError(404, 'Not found.');
  }
  return pathname;
}

function enforceOrigin(req, publicOrigin) {
  if (req.headers['sec-fetch-site'] === 'cross-site')
    throw new HttpError(403, 'Cross-origin writes are not allowed.');
  const origin = req.headers.origin;
  if (!origin) return; // CLI clients do not send Origin; they still need a valid token.
  try {
    const supplied = new URL(origin);
    const protocol = req.socket.encrypted ? 'https:' : 'http:';
    if (!req.headers.host) throw new Error('Missing request host.');
    // Explicit configuration supports TLS termination without trusting spoofable proxy headers.
    const expected = new URL(publicOrigin || `${protocol}//${req.headers.host}`);
    if (
      supplied.origin === 'null' ||
      origin !== supplied.origin ||
      supplied.origin !== expected.origin ||
      expected.username ||
      expected.password ||
      expected.pathname !== '/' ||
      expected.search ||
      expected.hash
    )
      throw new Error('Origin mismatch.');
  } catch {
    throw new HttpError(403, 'Cross-origin writes are not allowed.');
  }
}

async function readJson(req) {
  if (
    (req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new HttpError(415, 'Use Content-Type: application/json.');
  }
  if (
    req.headers['content-encoding'] &&
    req.headers['content-encoding'].toLowerCase() !== 'identity'
  ) {
    throw new HttpError(415, 'Compressed JSON bodies are not supported.');
  }
  if (Number(req.headers['content-length']) > JSON_LIMIT)
    throw new HttpError(413, 'JSON metadata may not exceed 64 KiB.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw new HttpError(413, 'JSON metadata may not exceed 64 KiB.');
    chunks.push(chunk);
  }
  try {
    // Reject malformed UTF-8 rather than silently publishing replacement characters.
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)),
    );
  } catch {
    throw new HttpError(400, 'Provide valid UTF-8 JSON metadata.');
  }
}

/** Create an unbound server. Every configured path is resolved independently of cwd. */
export function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir ?? path.join(projectDir, 'data'));
  const mediaDir = path.resolve(options.mediaDir ?? path.join(projectDir, 'media'));
  const frontendDir = path.resolve(options.frontendDir ?? path.join(projectDir, 'frontend'));
  const adminToken = options.adminToken ?? process.env.AUDIORA_ADMIN_TOKEN ?? '';
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? '';
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicOrigin) {
      throw new TypeError(
        'PUBLIC_ORIGIN must be an HTTP(S) origin without a path or trailing slash.',
      );
    }
  }
  const maxUploadBytes = Number(
    options.maxUploadBytes ?? process.env.MAX_UPLOAD_BYTES ?? DEFAULT_UPLOAD_LIMIT,
  );
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1)
    throw new TypeError('maxUploadBytes must be a positive safe integer.');
  const uploadsEnabled =
    typeof adminToken === 'string' && adminToken.length >= 24 && !/\s/u.test(adminToken);
  const expectedToken = uploadsEnabled ? createHash('sha256').update(adminToken).digest() : null;
  const store = createStore(dataDir);

  function authorize(req) {
    if (!uploadsEnabled)
      throw new HttpError(
        503,
        'Creator uploads are disabled. Configure an admin token of at least 24 characters.',
      );
    enforceOrigin(req, publicOrigin);
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    const supplied = createHash('sha256')
      .update(match?.[1] || '')
      .digest();
    if (!timingSafeEqual(expectedToken, supplied) || !match)
      throw new HttpError(401, 'A valid creator token is required.');
  }

  async function route(req, res) {
    const pathname = pathnameOf(req);
    const read = req.method === 'GET' || req.method === 'HEAD';
    const api = pathname === '/api' || pathname.startsWith('/api/');
    if (api) {
      if (req.method === 'POST' && pathname === '/api/uploads') {
        authorize(req);
        const audioUrl = await storeUpload(req, { mediaDir, maxUploadBytes, store });
        sendJson(req, res, 201, { audioUrl });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/episodes') {
        authorize(req);
        const metadata = validateEpisode(await readJson(req));
        const episode = await store.publish(metadata, (filename) =>
          verifyUploadFile(mediaDir, filename),
        );
        res.setHeader('Location', `/api/episodes/${episode.id}`);
        sendJson(req, res, 201, { episode });
        return;
      }
      if (read && pathname === '/api/health')
        return sendJson(req, res, 200, { status: 'ok', name: 'Audiora' });
      if (read && pathname === '/api/config')
        return sendJson(req, res, 200, { uploadsEnabled, maxUploadBytes, languages: LANGUAGES });
      if (read && pathname === '/api/episodes') {
        const filters = parseFilters(new URL(req.url, 'http://localhost').searchParams);
        const episodes = filterEpisodes(await store.list(), filters);
        return sendJson(req, res, 200, { episodes, total: episodes.length });
      }
      if (read && /^\/api\/episodes\/[^/]+$/.test(pathname)) {
        const id = pathname.slice('/api/episodes/'.length);
        const episode = (await store.list()).find((item) => item.id === id);
        if (!episode) throw new HttpError(404, 'Episode not found.');
        return sendJson(req, res, 200, { episode });
      }
      if (
        ['/api/episodes', '/api/health', '/api/config', '/api/uploads'].includes(pathname) ||
        /^\/api\/episodes\/[^/]+$/.test(pathname)
      ) {
        const allow =
          pathname === '/api/uploads'
            ? 'POST'
            : pathname === '/api/episodes'
              ? 'GET, HEAD, POST'
              : 'GET, HEAD';
        res.setHeader('Allow', allow);
        throw new HttpError(405, 'Method not allowed.');
      }
      throw new HttpError(404, 'API endpoint not found.');
    }
    if (!read) {
      res.setHeader('Allow', 'GET, HEAD');
      throw new HttpError(405, 'Method not allowed.');
    }
    if (pathname.startsWith('/media/')) {
      const upload = UPLOAD_URL.exec(pathname);
      const isRootAudio =
        !pathname.startsWith('/media/uploads/') &&
        !pathname.slice('/media/'.length).includes('/') &&
        !pathname.slice('/media/'.length).startsWith('.') &&
        /\.(?:mp3|m4a)$/i.test(pathname);
      if (!isRootAudio && (!upload || !(await store.ownsUpload(upload[1]))))
        throw new HttpError(404, 'Audio file not found.');
      const ext = path.extname(pathname).toLowerCase();
      const contentType = ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';
      return serveFile(req, res, mediaDir, pathname.slice('/media/'.length), contentType, {
        media: true,
      });
    }
    const publicPath = pathname === '/' ? '/index.html' : pathname;
    const extension = path.extname(publicPath).toLowerCase();
    const isEntrypoint = publicPath === '/index.html';
    const isRootScript = /^\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:js|css)$/.test(publicPath);
    const isModule = publicPath.startsWith('/js/') && extension === '.js';
    const isAsset = publicPath.startsWith('/assets/') && extension !== '.html';
    if (
      !staticTypes[extension] ||
      (!isEntrypoint && !isRootScript && !isModule && !isAsset && publicPath !== '/favicon.ico')
    )
      throw new HttpError(404, 'Not found.');
    return serveFile(req, res, frontendDir, publicPath.slice(1), staticTypes[extension]);
  }

  const server = http.createServer(
    {
      maxHeaderSize: 16 * 1024,
      headersTimeout: 30_000,
      requestTimeout: 300_000,
      keepAliveTimeout: 5_000,
      connectionsCheckingInterval: 1_000,
    },
    (req, res) => {
      for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
      req.on('error', () => {}); // Aborted clients must never crash the process.
      route(req, res).catch((error) => {
        if (res.headersSent || res.destroyed) {
          if (!res.destroyed) res.destroy();
          return;
        }
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 401)
          res.setHeader('WWW-Authenticate', 'Bearer realm="Audiora Creator Studio"');
        if (!req.complete) {
          res.setHeader('Connection', 'close');
          req.resume();
        }
        sendJson(req, res, status, {
          error:
            error instanceof HttpError
              ? error.message
              : 'The server could not complete the request. Please try again.',
        });
      });
    },
  );
  server.timeout = 60_000;
  server.maxRequestsPerSocket = 1000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
    const host = process.env.HOST || '127.0.0.1';
    const app = createApp();
    app.on('error', () => {
      console.error(
        'Audiora could not start. Check your server configuration and port availability.',
      );
      process.exitCode = 1;
    });
    app.listen(port, host, () => {
      const address = app.address();
      const displayHost = host.includes(':') ? `[${host}]` : host;
      console.log(`Audiora is listening at http://${displayHost}:${address.port}`);
    });
    const shutdown = () => {
      app.close(() => process.exit(0));
      app.closeIdleConnections();
      setTimeout(() => {
        app.closeAllConnections();
        process.exit(0);
      }, 10_000).unref();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    console.error('Audiora could not start. Check your server configuration.');
    process.exitCode = 1;
  }
}
