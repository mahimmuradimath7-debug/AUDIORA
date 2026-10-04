import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../backend/server.js';

const TOKEN = 'audiora-test-token-at-least-24-characters';
// MPEG-1 layer III header plus frame-sized fixture bytes. Validation is structural,
// not a decoding/transcoding test; integration supplies the actual audible MP3.
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(830, 0x55)]);
const M4A = Buffer.concat([
  Buffer.from([
    0x00, 0x00, 0x00, 0x20, // 32 bytes box size
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x4d, 0x34, 0x41, 0x20, // 'M4A '
    0x00, 0x00, 0x02, 0x00, // minor version
    0x4d, 0x34, 0x41, 0x20, // compatible brand 'M4A '
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x6d, 0x70, 0x34, 0x32, // 'mp42'
    0x00, 0x00, 0x00, 0x00,
  ]),
  Buffer.alloc(800, 0xaa),
]);
const WAV = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x70, 0x00, 0x00, 0x00]),
  Buffer.from('WAVEfmt ', 'ascii'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from([0x01, 0x00, 0x01, 0x00]),
  Buffer.from([0x44, 0xac, 0x00, 0x00]),
  Buffer.from([0x88, 0x58, 0x01, 0x00]),
  Buffer.from([0x02, 0x00, 0x10, 0x00]),
  Buffer.from('data', 'ascii'),
  Buffer.from([0x40, 0x00, 0x00, 0x00]),
  Buffer.alloc(64, 0xbb),
]);
const auth = { Authorization: `Bearer ${TOKEN}` };

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'audiora-backend-'));
  const dataDir = path.join(root, 'data');
  const mediaDir = path.join(root, 'media');
  const frontendDir = path.join(root, 'frontend');
  await Promise.all([
    mkdir(mediaDir),
    mkdir(path.join(frontendDir, 'assets'), { recursive: true }),
    mkdir(path.join(frontendDir, 'js'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(mediaDir, 'audiora-preview.mp3'), MP3),
    writeFile(path.join(frontendDir, 'index.html'), '<!doctype html><title>Audiora test</title>'),
    writeFile(path.join(frontendDir, 'app.js'), 'console.log("local asset");'),
    writeFile(path.join(frontendDir, 'js', 'app.js'), 'export const app = "Audiora";'),
    writeFile(path.join(frontendDir, 'styles.css'), 'body { color: #222; }'),
    writeFile(
      path.join(frontendDir, 'assets', 'orbit.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ),
  ]);
  const options = {
    dataDir,
    mediaDir,
    frontendDir,
    adminToken: TOKEN,
    maxUploadBytes: 2048,
    ...overrides,
  };
  const servers = new Set();
  async function start() {
    const server = createApp(options);
    servers.add(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return { server, url: `http://127.0.0.1:${server.address().port}` };
  }
  async function stop(server) {
    if (!servers.has(server)) return;
    const closed = new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    server.closeAllConnections();
    await closed;
    servers.delete(server);
  }
  t.after(async () => {
    await Promise.all([...servers].map(stop));
    await rm(root, { recursive: true, force: true });
  });
  return { root, dataDir, mediaDir, frontendDir, start, stop, ...(await start()) };
}

function metadata(audioUrl, overrides = {}) {
  return {
    title: 'ಹೊಸ ಕಥೆ · A fresh story',
    show: 'A test studio',
    host: 'Fictional studio',
    description: 'An original test recording about café mornings and ಹೊಸ ಕಥೆಗಳು.',
    language: 'kn',
    category: 'Stories',
    mood: 'Curious',
    duration: 12.5,
    audioUrl,
    artwork: 'bloom',
    ...overrides,
  };
}

async function upload(url, { body = MP3, headers = {} } = {}) {
  return fetch(`${url}/api/uploads`, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'audio/mpeg',
      'X-Filename': encodeURIComponent('ನನ್ನ ಧ್ವನಿ.mp3'),
      ...headers,
    },
    body,
  });
}

async function publish(url, value, headers = {}) {
  return fetch(`${url}/api/episodes`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });
}

async function errorResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const result = await response.json();
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length > 0);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  return result;
}

function rawRequest(url, pathname, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      { hostname: target.hostname, port: target.port, path: pathname, method, headers },
      (res) => {
        const buffers = [];
        res.on('data', (chunk) => buffers.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(buffers) }),
        );
      },
    );
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('health, config, security headers, and read-only startup', async (t) => {
  const f = await fixture(t, { adminToken: '' });
  const response = await fetch(`${f.url}/api/health`);
  assert.deepEqual(await response.json(), { status: 'ok', name: 'Audiora' });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /media-src 'self' blob:/);
  const config = await (await fetch(`${f.url}/api/config`)).json();
  assert.equal(config.uploadsEnabled, false);
  assert.equal(config.maxUploadBytes, 2048);
  assert.deepEqual(config.languages.map((item) => item.code).sort(), ['en', 'hi', 'kn']);
  assert.ok(config.languages.every((item) => item.name && item.nativeName));
  await fetch(`${f.url}/api/episodes`).then((res) => res.json());
  await assert.rejects(stat(f.dataDir), { code: 'ENOENT' });
});

test('12 fictional episodes include four per language and one shared honest preview', async (t) => {
  const f = await fixture(t);
  const catalogue = await (await fetch(`${f.url}/api/episodes`)).json();
  assert.equal(catalogue.total, 12);
  assert.equal(catalogue.episodes[0].title, 'The art of slowing down');
  assert.equal(catalogue.episodes[0].show, 'The Quiet Hours');
  assert.equal(catalogue.episodes[0].language, 'en');
  assert.equal(catalogue.episodes[0].artwork, 'orbit');
  assert.equal(catalogue.episodes[0].featured, true);
  for (const episode of catalogue.episodes) {
    assert.equal(episode.duration, 30);
    assert.equal(episode.audioUrl, '/media/audiora-preview.mp3');
    assert.equal(episode.demo, true);
    assert.match(episode.description, /ambient preview, not spoken dialogue/);
  }
  for (const language of ['kn', 'hi', 'en']) {
    const filtered = await (await fetch(`${f.url}/api/episodes?language=${language}`)).json();
    assert.equal(filtered.total, 4);
    assert.ok(filtered.episodes.every((episode) => episode.language === language));
  }
  const detail = await (await fetch(`${f.url}/api/episodes/${catalogue.episodes[0].id}`)).json();
  assert.deepEqual(detail.episode, catalogue.episodes[0]);
  await errorResponse(await fetch(`${f.url}/api/episodes/missing`), 404);
});

test('discovery combines enums and Unicode-aware text search', async (t) => {
  const f = await fixture(t);
  for (const [query, expected] of [
    ['?language=en&category=Mindfulness&mood=Unwind&q=SLOWING', 1],
    [`?q=${encodeURIComponent('ನಿಧಾನವಾಗಿ')}`, 1],
    [`?q=${encodeURIComponent('थोड़ा ठहर कर')}`, 1],
    ['?q=SMALL%20WONDERS%20STUDIO', 1],
    ['?q=neighbourhood%20memories', 1],
    ['?language=all&category=all&mood=all', 12],
    ['?language=kn&category=Technology', 0],
    ['?q=does-not-exist', 0],
  ]) {
    const response = await fetch(`${f.url}/api/episodes${query}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, expected, query);
    assert.equal(result.total, result.episodes.length);
  }
  for (const query of [
    'language=fr',
    'category=Music',
    'mood=Popular',
    'language=',
    'language=kn&language=hi',
    'q=a&q=b',
    `q=${'x'.repeat(257)}`,
  ]) {
    await errorResponse(await fetch(`${f.url}/api/episodes?${query}`), 400);
  }
});

test('write APIs are disabled without a sufficiently long configured token', async (t) => {
  for (const adminToken of ['', 'too-short']) {
    const f = await fixture(t, { adminToken });
    assert.equal((await (await fetch(`${f.url}/api/config`)).json()).uploadsEnabled, false);
    await errorResponse(await upload(f.url), 503);
    await errorResponse(await publish(f.url, {}), 503);
    await assert.rejects(stat(path.join(f.mediaDir, 'uploads')), { code: 'ENOENT' });
  }
});

test('both write APIs require the creator token and a same-origin browser request', async (t) => {
  const f = await fixture(t);
  assert.equal((await (await fetch(`${f.url}/api/config`)).json()).uploadsEnabled, true);
  for (const authorization of [
    '',
    'Basic anything',
    'Bearer short',
    `Bearer ${'x'.repeat(TOKEN.length)}`,
  ]) {
    const response = await upload(f.url, { headers: { Authorization: authorization } });
    assert.match(response.headers.get('www-authenticate'), /^Bearer/);
    await errorResponse(response, 401);
    await errorResponse(await publish(f.url, {}, { Authorization: authorization }), 401);
  }
  for (const origin of [
    'https://evil.example',
    'null',
    `${f.url}/different-path`,
    f.url.replace('http:', 'https:'),
  ]) {
    await errorResponse(await upload(f.url, { headers: { Origin: origin } }), 403);
    await errorResponse(await publish(f.url, {}, { Origin: origin }), 403);
  }
  await errorResponse(await upload(f.url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
  const allowed = await upload(f.url, { headers: { Origin: f.url } });
  assert.equal(allowed.status, 201);
  await allowed.json();
});

test('explicit public origin supports HTTPS proxies without trusting forwarded headers', async (t) => {
  const f = await fixture(t, { publicOrigin: 'https://audiora.example.com' });
  const allowed = await upload(f.url, { headers: { Origin: 'https://audiora.example.com' } });
  assert.equal(allowed.status, 201);
  await allowed.json();
  await errorResponse(await upload(f.url, { headers: { Origin: f.url } }), 403);
  await errorResponse(
    await upload(f.url, {
      headers: {
        Origin: 'https://evil.example',
        'X-Forwarded-Host': 'evil.example',
        'X-Forwarded-Proto': 'https',
      },
    }),
    403,
  );
  for (const publicOrigin of [
    'https://audiora.example.com/',
    'file:///private',
    'https://user:pass@example.com',
  ]) {
    assert.throws(() => createApp({ publicOrigin }));
  }
});

test('MP3 upload, publication, media serving, and catalogue survive a restart', async (t) => {
  const f = await fixture(t);
  const uploaded = await upload(f.url);
  assert.equal(uploaded.status, 201);
  const { audioUrl } = await uploaded.json();
  assert.match(audioUrl, /^\/media\/uploads\/[0-9a-f-]{36}\.mp3$/);
  assert.ok(!audioUrl.includes('ನನ್ನ'));
  const response = await publish(f.url, metadata(audioUrl), { Origin: f.url });
  assert.equal(response.status, 201);
  const { episode } = await response.json();
  assert.equal(response.headers.get('location'), `/api/episodes/${episode.id}`);
  assert.deepEqual(
    Object.fromEntries(Object.keys(metadata(audioUrl)).map((key) => [key, episode[key]])),
    metadata(audioUrl),
  );
  assert.equal(episode.demo, false);
  assert.equal(episode.featured, false);
  assert.ok(Number.isFinite(Date.parse(episode.publishedAt)));
  const audio = await fetch(`${f.url}${audioUrl}`);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), MP3);
  const state = JSON.parse(await readFile(path.join(f.dataDir, 'catalog.json'), 'utf8'));
  assert.deepEqual(state.episodes, [episode]);
  assert.deepEqual(state.uploads, [audioUrl.split('/').at(-1)]);
  assert.deepEqual(await readdir(f.dataDir), ['catalog.json']);
  await f.stop(f.server);
  const restarted = await f.start();
  assert.deepEqual(
    (await (await fetch(`${restarted.url}/api/episodes/${episode.id}`)).json()).episode,
    episode,
  );
  assert.equal((await (await fetch(`${restarted.url}/api/episodes`)).json()).total, 13);
  const normalizedSearch = await (
    await fetch(`${restarted.url}/api/episodes?q=${encodeURIComponent('CAFE\u0301')}`)
  ).json();
  assert.equal(normalizedSearch.total, 1);
  assert.equal(normalizedSearch.episodes[0].id, episode.id);
  // Ownership is durable, so a previous upload can be published after a restart.
  const secondPublication = await publish(
    restarted.url,
    metadata(audioUrl, { title: 'Second episode' }),
  );
  assert.equal(secondPublication.status, 201);
  await secondPublication.json();
});

test('parallel uploads and publication serialize without losing any records', async (t) => {
  const f = await fixture(t);
  const urls = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const response = await upload(f.url);
      assert.equal(response.status, 201);
      return (await response.json()).audioUrl;
    }),
  );
  const ids = await Promise.all(
    urls.map(async (audioUrl, index) => {
      const response = await publish(
        f.url,
        metadata(audioUrl, { title: `Concurrent episode ${index}` }),
      );
      assert.equal(response.status, 201);
      return (await response.json()).episode.id;
    }),
  );
  assert.equal(new Set(ids).size, 8);
  const persisted = JSON.parse(await readFile(path.join(f.dataDir, 'catalog.json'), 'utf8'));
  assert.equal(persisted.uploads.length, 8);
  assert.deepEqual(persisted.episodes.map((episode) => episode.id).sort(), ids.sort());
  assert.equal((await (await fetch(`${f.url}/api/episodes`)).json()).total, 20);
  assert.deepEqual(await readdir(f.dataDir), ['catalog.json']);
});

test('JSON parsing rejects malformed, oversized, non-UTF8, and unsupported bodies', async (t) => {
  const f = await fixture(t);
  for (const body of ['{', '', 'null', '[]', 'true', '"text"']) {
    await errorResponse(
      await fetch(`${f.url}/api/episodes`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body,
      }),
      400,
    );
  }
  await errorResponse(
    await fetch(`${f.url}/api/episodes`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: `{"description":"${'x'.repeat(65536)}"}`,
    }),
    413,
  );
  await errorResponse(
    await fetch(`${f.url}/api/episodes`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: Buffer.from([0x7b, 0xff, 0x7d]),
    }),
    400,
  );
  await errorResponse(await publish(f.url, {}, { 'Content-Type': 'text/plain' }), 415);
  await errorResponse(await publish(f.url, {}, { 'Content-Encoding': 'gzip' }), 415);
  const chunked = await rawRequest(f.url, '/api/episodes', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    chunks: ['{"description":"', 'x'.repeat(33000), 'x'.repeat(33000), '"}'],
  });
  assert.equal(chunked.status, 413);
  assert.equal(typeof JSON.parse(chunked.body).error, 'string');
});

test('publication validates lengths, enums, duration, and untrusted fields', async (t) => {
  const f = await fixture(t);
  const { audioUrl } = await (await upload(f.url)).json();
  const invalid = [
    { title: '' },
    { title: 'x'.repeat(161) },
    { title: 12 },
    { show: ' ' },
    { show: 'x'.repeat(121) },
    { host: 'x'.repeat(101) },
    { description: 'x'.repeat(2001) },
    { description: 'unsafe\u0000text' },
    { language: 'fr' },
    { category: 'Music' },
    { mood: 'Happy' },
    { artwork: '../../private' },
    { duration: 0 },
    { duration: -1 },
    { duration: null },
    { duration: '30' },
    { duration: 86401 },
    { featured: true },
    { demo: true },
    { id: 'chosen-id' },
    { adminToken: TOKEN },
    { audioUrl: 'https://example.com/test.mp3' },
    { audioUrl: '/media/audiora-preview.mp3' },
    { audioUrl: '/media/uploads/../../secret.mp3' },
    { audioUrl: 'file:///etc/passwd' },
  ];
  for (const overrides of invalid)
    await errorResponse(await publish(f.url, metadata(audioUrl, overrides)), 400);
  assert.equal((await (await fetch(`${f.url}/api/episodes`)).json()).total, 12);
  const files = await readdir(path.join(f.mediaDir, 'uploads'));
  assert.deepEqual(
    files,
    [audioUrl.split('/').at(-1)],
    'invalid metadata leaves the valid upload available for retry',
  );
});

test('publication requires owned, present, non-symlink local uploads', async (t) => {
  const f = await fixture(t);
  const { audioUrl } = await (await upload(f.url)).json();
  const fabricated = '/media/uploads/00000000-0000-4000-8000-000000000000.mp3';
  await writeFile(path.join(f.mediaDir, fabricated.slice('/media/'.length)), MP3);
  await errorResponse(await publish(f.url, metadata(fabricated)), 400);
  await errorResponse(await fetch(`${f.url}${fabricated}`), 404);
  const actualFile = path.join(f.mediaDir, audioUrl.slice('/media/'.length));
  await unlink(actualFile);
  await errorResponse(await publish(f.url, metadata(audioUrl)), 400);
  const outside = path.join(f.root, 'private-audio.mp3');
  await writeFile(outside, MP3);
  await symlink(outside, actualFile);
  await errorResponse(await publish(f.url, metadata(audioUrl)), 400);
  await errorResponse(await fetch(`${f.url}${audioUrl}`), 404);
});

test('upload validation checks extension, MIME, header, size, and safe filename', async (t) => {
  const f = await fixture(t);
  for (const filename of [
    'track.svg',
    'track.html',
    '../track.mp3',
    '/track.mp3',
    'C:\\track.mp3',
    '.hidden.mp3',
    'track\u0000.mp3',
    'x'.repeat(240) + '.mp3',
  ]) {
    await errorResponse(
      await upload(f.url, { headers: { 'X-Filename': encodeURIComponent(filename) } }),
      400,
    );
  }
  await errorResponse(await upload(f.url, { headers: { 'X-Filename': '%' } }), 400);
  await errorResponse(await upload(f.url, { headers: { 'X-Filename': '' } }), 400);
  await errorResponse(await upload(f.url, { headers: { 'Content-Type': 'text/html' } }), 415);
  await errorResponse(
    await upload(f.url, { headers: { 'Content-Type': 'application/octet-stream' } }),
    415,
  );
  await errorResponse(await upload(f.url, { headers: { 'Content-Encoding': 'gzip' } }), 415);
  for (const body of [
    Buffer.alloc(0),
    Buffer.from('<html>not audio</html>'),
    Buffer.from('ID3'),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]),
    Buffer.concat([
      Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]),
      Buffer.from('<html>not audio</html>'),
    ]),
    Buffer.concat([Buffer.from([0xc9, 0xc4, 0xb3, 4, 0, 0, 0, 0, 0, 0]), MP3]),
  ]) {
    await errorResponse(await upload(f.url, { body }), 400);
  }
  await errorResponse(await upload(f.url, { body: Buffer.concat([MP3, Buffer.alloc(2048)]) }), 413);
  const chunked = await rawRequest(f.url, '/api/uploads', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'audio/mpeg', 'X-Filename': 'large.mp3' },
    chunks: [MP3, Buffer.alloc(900), Buffer.alloc(900)],
  });
  assert.equal(chunked.status, 413);
  assert.equal(typeof JSON.parse(chunked.body).error, 'string');
  assert.deepEqual(await readdir(path.join(f.mediaDir, 'uploads')), []);
  const tagged = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), MP3]);
  const valid = await upload(f.url, { body: tagged, headers: { 'X-Filename': 'TRACK.MP3' } });
  assert.equal(valid.status, 201);
  await valid.json();
});

test('local media supports exact, open-ended, clamped, and suffix byte ranges', async (t) => {
  const f = await fixture(t);
  const cases = [
    ['bytes=0-3', 0, 3],
    ['bytes=4-19', 4, 19],
    ['bytes=800-', 800, MP3.length - 1],
    ['bytes=800-999999', 800, MP3.length - 1],
    ['bytes=-12', MP3.length - 12, MP3.length - 1],
    ['bytes=-99999', 0, MP3.length - 1],
  ];
  for (const [range, start, end] of cases) {
    const response = await fetch(`${f.url}/media/audiora-preview.mp3`, {
      headers: { Range: range },
    });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${MP3.length}`);
    assert.equal(response.headers.get('content-length'), String(end - start + 1));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), MP3.subarray(start, end + 1));
  }
  const full = await fetch(`${f.url}/media/audiora-preview.mp3`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-length'), String(MP3.length));
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), MP3);
  const lastModified = full.headers.get('last-modified');
  const unchanged = await fetch(`${f.url}/media/audiora-preview.mp3`, {
    headers: { Range: 'bytes=0-3', 'If-Range': lastModified },
  });
  assert.equal(unchanged.status, 206);
  await unchanged.arrayBuffer();
  const changed = await fetch(`${f.url}/media/audiora-preview.mp3`, {
    headers: { Range: 'bytes=0-3', 'If-Range': 'Wed, 01 Jan 1997 00:00:00 GMT' },
  });
  assert.equal(changed.status, 200);
  assert.deepEqual(Buffer.from(await changed.arrayBuffer()), MP3);
});

test('invalid and unsatisfiable ranges produce safe 416 responses', async (t) => {
  const f = await fixture(t);
  for (const range of [
    'bytes=99999-',
    `bytes=${MP3.length}-`,
    'bytes=30-20',
    'bytes=-0',
    'bytes=-',
    'bytes=0-3,8-11',
    'items=0-3',
    'bytes=abc-def',
    'bytes=9007199254740992-',
    'bytes=0-9007199254740992',
    'bytes=-9007199254740992',
  ]) {
    const response = await fetch(`${f.url}/media/audiora-preview.mp3`, {
      headers: { Range: range },
    });
    assert.equal(response.headers.get('content-range'), `bytes */${MP3.length}`, range);
    await errorResponse(response, 416);
  }
  await writeFile(path.join(f.mediaDir, 'audiora-preview.mp3'), Buffer.alloc(0));
  const response = await fetch(`${f.url}/media/audiora-preview.mp3`, {
    headers: { Range: 'bytes=0-' },
  });
  assert.equal(response.headers.get('content-range'), 'bytes */0');
  await errorResponse(response, 416);
});

test('HEAD returns the GET headers without a body and ignores Range per HTTP semantics', async (t) => {
  const f = await fixture(t);
  for (const route of [
    '/',
    '/app.js',
    '/js/app.js',
    '/assets/orbit.svg',
    '/media/audiora-preview.mp3',
    '/api/health',
    '/api/episodes',
    '/api/config',
  ]) {
    const get = await fetch(`${f.url}${route}`);
    const bytes = Buffer.from(await get.arrayBuffer());
    const head = await rawRequest(f.url, route, { method: 'HEAD' });
    assert.equal(head.status, 200, route);
    assert.equal(head.body.length, 0, route);
    assert.equal(head.headers['content-length'], String(bytes.length), route);
    assert.equal(head.headers['content-type'], get.headers.get('content-type'), route);
  }
  const rangedHead = await rawRequest(f.url, '/media/audiora-preview.mp3', {
    method: 'HEAD',
    headers: { Range: 'bytes=0-3' },
  });
  assert.equal(rangedHead.status, 200);
  assert.equal(rangedHead.headers['content-length'], String(MP3.length));
  assert.equal(rangedHead.headers['content-range'], undefined);
  assert.equal(rangedHead.body.length, 0);
  const missing = await rawRequest(f.url, '/api/episodes/missing', { method: 'HEAD' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.length, 0);
  assert.ok(Number(missing.headers['content-length']) > 0);
});

test('only public entrypoints and assets are exposed; traversal and symlink escapes fail', async (t) => {
  const f = await fixture(t);
  await Promise.all([
    writeFile(path.join(f.root, 'secret.js'), 'private-data-marker'),
    writeFile(path.join(f.frontendDir, '.env'), `TOKEN=${TOKEN}`),
    writeFile(path.join(f.frontendDir, 'app.js.map'), '{"sourcesContent":["private source"]}'),
    mkdir(path.join(f.frontendDir, 'backend')),
  ]);
  await writeFile(path.join(f.frontendDir, 'backend', 'server.js'), 'private-data-marker');
  await symlink(path.join(f.root, 'secret.js'), path.join(f.frontendDir, 'assets', 'leak.js'));
  await symlink(f.root, path.join(f.frontendDir, 'assets', 'escape'));
  for (const route of [
    '/.env',
    '/%2eenv',
    '/backend/server.js',
    '/data/catalog.json',
    '/tools/generate-demo.cjs',
    '/package.json',
    '/app.js.map',
    '/assets/',
    '/media/',
    '/media/uploads/',
    '/assets/../backend/server.js',
    '/assets/%2e%2e/backend/server.js',
    '/assets/%2e%2e/%2e%2e/secret.js',
    '/assets/%2f..%2f..%2fsecret.js',
    '/assets/..%5c..%5csecret.js',
    '/%00',
    '//example.com/',
    '/assets/leak.js',
    '/assets/escape/secret.js',
    '/media/uploads/.partial.mp3',
  ]) {
    const response = await rawRequest(f.url, route);
    assert.ok([400, 404].includes(response.status), `${route} returned ${response.status}`);
    assert.ok(!response.body.toString().includes('private-data-marker'));
    assert.ok(!response.body.toString().includes(TOKEN));
  }
  const malformed = await rawRequest(f.url, '/assets/%not-an-encoding');
  assert.equal(malformed.status, 400);
  const excessive = await rawRequest(f.url, `/${'a'.repeat(4200)}`);
  assert.equal(excessive.status, 414);
  for (const route of [
    '/',
    '/index.html',
    '/app.js',
    '/js/app.js',
    '/styles.css',
    '/assets/orbit.svg',
  ]) {
    const response = await fetch(`${f.url}${route}`);
    assert.equal(response.status, 200, route);
    await response.text();
  }
});

test('unsupported methods and unknown APIs return consistent JSON errors', async (t) => {
  const f = await fixture(t);
  for (const [route, method, allow] of [
    ['/api/episodes', 'PUT', 'GET, HEAD, POST'],
    ['/api/uploads', 'GET', 'POST'],
    ['/api/health', 'POST', 'GET, HEAD'],
    ['/', 'DELETE', 'GET, HEAD'],
  ]) {
    const response = await fetch(`${f.url}${route}`, { method });
    assert.equal(response.headers.get('allow'), allow);
    await errorResponse(response, 405);
  }
  await errorResponse(await fetch(`${f.url}/api/unknown`), 404);
});

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(10);
  }
  assert.fail('Expected asynchronous cleanup did not complete.');
}

test('an interrupted raw upload removes its partial file', async (t) => {
  const f = await fixture(t, { maxUploadBytes: 10000 });
  const target = new URL(f.url);
  const req = http.request({
    hostname: target.hostname,
    port: target.port,
    path: '/api/uploads',
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'audio/mpeg',
      'X-Filename': 'interrupted.mp3',
      'Content-Length': '5000',
    },
  });
  req.on('error', () => {});
  req.write(MP3);
  const uploadDir = path.join(f.mediaDir, 'uploads');
  await eventually(async () => {
    const files = await readdir(uploadDir).catch(() => []);
    return files.some((name) => name.endsWith('.part'));
  });
  req.destroy();
  await eventually(async () => (await readdir(uploadDir)).length === 0);
  await assert.rejects(stat(f.dataDir), { code: 'ENOENT' });
});

test('storage failures clean the uploaded file and never expose private error details', async (t) => {
  const f = await fixture(t);
  await writeFile(f.dataDir, 'This file intentionally blocks the data directory.');
  const response = await upload(f.url);
  const result = await errorResponse(response, 500);
  assert.ok(!result.error.includes(f.root));
  assert.ok(!result.error.includes('ENOTDIR'));
  assert.deepEqual(await readdir(path.join(f.mediaDir, 'uploads')), []);
});

test('invalid saved catalogues are not silently reset or overwritten', async (t) => {
  const f = await fixture(t);
  await mkdir(f.dataDir);
  const original = '{broken persisted catalogue';
  await writeFile(path.join(f.dataDir, 'catalog.json'), original);
  await errorResponse(await fetch(`${f.url}/api/episodes`), 500);
  await errorResponse(await upload(f.url), 500);
  assert.equal(await readFile(path.join(f.dataDir, 'catalog.json'), 'utf8'), original);
  assert.deepEqual(await readdir(path.join(f.mediaDir, 'uploads')), []);
});

test('M4A upload, publication, and streaming support', async (t) => {
  const f = await fixture(t);
  const uploaded = await upload(f.url, {
    body: M4A,
    headers: { 'Content-Type': 'audio/mp4', 'X-Filename': 'recording.m4a' },
  });
  assert.equal(uploaded.status, 201);
  const { audioUrl } = await uploaded.json();
  assert.match(audioUrl, /^\/media\/uploads\/[0-9a-f-]{36}\.m4a$/);

  const response = await publish(f.url, metadata(audioUrl), { Origin: f.url });
  assert.equal(response.status, 201);
  const { episode } = await response.json();
  assert.equal(episode.audioUrl, audioUrl);

  const audio = await fetch(`${f.url}${audioUrl}`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get('content-type'), 'audio/mp4');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), M4A);

  const ranged = await fetch(`${f.url}${audioUrl}`, { headers: { Range: 'bytes=0-15' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 0-15/${M4A.length}`);
  assert.equal(ranged.headers.get('content-type'), 'audio/mp4');

  const badM4a = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x6e, 0x6f, 0x74, 0x61, ...Buffer.alloc(20)]);
  await errorResponse(
    await upload(f.url, {
      body: badM4a,
      headers: { 'Content-Type': 'audio/mp4', 'X-Filename': 'bad.m4a' },
    }),
    400,
  );
});

test('MP4 and WAV upload, publication, and streaming support', async (t) => {
  const f = await fixture(t);

  // Test MP4 upload
  const mp4Uploaded = await upload(f.url, {
    body: M4A,
    headers: { 'Content-Type': 'video/mp4', 'X-Filename': 'recording.mp4' },
  });
  assert.equal(mp4Uploaded.status, 201);
  const { audioUrl: mp4Url } = await mp4Uploaded.json();
  assert.match(mp4Url, /^\/media\/uploads\/[0-9a-f-]{36}\.mp4$/);

  const mp4Pub = await publish(f.url, metadata(mp4Url), { Origin: f.url });
  assert.equal(mp4Pub.status, 201);
  const mp4Audio = await fetch(`${f.url}${mp4Url}`);
  assert.equal(mp4Audio.status, 200);
  assert.equal(mp4Audio.headers.get('content-type'), 'video/mp4');

  // Test WAV upload
  const wavUploaded = await upload(f.url, {
    body: WAV,
    headers: { 'Content-Type': 'audio/wav', 'X-Filename': 'recording.wav' },
  });
  assert.equal(wavUploaded.status, 201);
  const { audioUrl: wavUrl } = await wavUploaded.json();
  assert.match(wavUrl, /^\/media\/uploads\/[0-9a-f-]{36}\.wav$/);

  const wavPub = await publish(f.url, metadata(wavUrl), { Origin: f.url });
  assert.equal(wavPub.status, 201);
  const wavAudio = await fetch(`${f.url}${wavUrl}`);
  assert.equal(wavAudio.status, 200);
  assert.equal(wavAudio.headers.get('content-type'), 'audio/wav');
});

test('Supabase configuration and status endpoint report cloud settings', async (t) => {
  const f = await fixture(t, {
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-supabase-key',
  });
  const config = await (await fetch(`${f.url}/api/config`)).json();
  assert.equal(config.supabase?.enabled, true);
  assert.equal(config.supabase?.url, 'https://example.supabase.co');

  const status = await (await fetch(`${f.url}/api/supabase/status`)).json();
  assert.equal(status.enabled, true);
  assert.equal(status.url, 'https://example.supabase.co');
});

test('cloud audio publication and storage compatibility', async (t) => {
  const f = await fixture(t);
  const cloudUrl =
    'https://maivkyqwjlibilmpgmrk.supabase.co/storage/v1/object/public/audio/test-episode.m4a';
  const pub = await publish(f.url, metadata(cloudUrl), { Origin: f.url });
  assert.equal(pub.status, 201);
  const { episode } = await pub.json();
  assert.equal(episode.audioUrl, cloudUrl);

  const episodes = (await (await fetch(`${f.url}/api/episodes`)).json()).episodes;
  assert.ok(episodes.some((e) => e.audioUrl === cloudUrl));
});

test('missing upload redirects to Supabase cloud storage when configured', async (t) => {
  const f = await fixture(t, {
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key-12345678901234567890',
  });
  const up = await upload(f.url);
  const { audioUrl } = await up.json();
  const filePath = path.join(f.mediaDir, audioUrl.slice('/media/'.length));
  await unlink(filePath);

  const res = await fetch(`${f.url}${audioUrl}`, { redirect: 'manual' });
  assert.equal(res.status, 307);
  assert.equal(
    res.headers.get('location'),
    `https://example.supabase.co/storage/v1/object/public/audio/${path.basename(audioUrl)}`,
  );
});



