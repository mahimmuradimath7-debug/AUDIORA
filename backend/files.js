import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  HttpError,
  mp3FrameOffset,
  plausibleMp3,
  plausibleM4a,
  plausibleWav,
  validateFilename,
} from './validation.js';
import { syncDirectory } from './store.js';

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function openConfined(root, relative) {
  let handle;
  try {
    const candidate = path.resolve(root, relative);
    if (!within(path.resolve(root), candidate)) throw new HttpError(404, 'File not found.');
    const [realRoot, resolved, entry] = await Promise.all([
      realpath(root),
      realpath(candidate),
      lstat(candidate),
    ]);
    if (!within(realRoot, resolved) || entry.isSymbolicLink())
      throw new HttpError(404, 'File not found.');
    handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw new HttpError(404, 'File not found.');
    return { handle, stat };
  } catch (error) {
    await handle?.close();
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(error.code))
      throw new HttpError(404, 'File not found.');
    throw error;
  }
}

export function parseRange(header, size) {
  const invalid = () => {
    throw new HttpError(416, 'The requested byte range is not available.');
  };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return invalid();
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if (
    (first !== undefined && !Number.isSafeInteger(first)) ||
    (last !== undefined && !Number.isSafeInteger(last))
  )
    return invalid();
  if (first === undefined) {
    if (!last) return invalid();
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== undefined && last < first)) return invalid();
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

export async function serveFile(req, res, root, relative, contentType, { media = false } = {}) {
  const { handle, stat } = await openConfined(root, relative);
  let stream;
  try {
    res.setHeader('Cache-Control', media ? 'public, max-age=3600' : 'no-cache');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('Accept-Ranges', 'bytes');
    let range;
    // RFC 9110: Range is ignored for methods other than GET, including HEAD.
    if (req.method === 'GET' && req.headers.range) {
      const ifRange = req.headers['if-range'];
      const rangeMatches = !ifRange || ifRange === stat.mtime.toUTCString();
      if (rangeMatches) {
        try {
          range = parseRange(req.headers.range, stat.size);
        } catch (error) {
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          throw error;
        }
      }
    }
    if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
    res.setHeader('Content-Length', range ? range.end - range.start + 1 : stat.size);
    res.statusCode = range ? 206 : 200;
    if (req.method === 'HEAD' || stat.size === 0) {
      res.end();
      return;
    }
    stream = handle.createReadStream({ ...(range || {}), autoClose: false });
    await pipeline(stream, res);
  } finally {
    stream?.destroy();
    await handle.close();
  }
}

export async function verifyUploadFile(mediaDir, filename) {
  try {
    const { handle, stat } = await openConfined(mediaDir, `uploads/${filename}`);
    await handle.close();
    if (stat.size <= 0) throw new Error('Empty upload.');
  } catch {
    throw new HttpError(400, 'The uploaded audio file is missing or unavailable. Upload it again.');
  }
}

function declaredSize(req, limit) {
  const size = req.headers['content-length'];
  if (size !== undefined && (!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size))))
    throw new HttpError(400, 'Invalid content length.');
  if (Number(size) > limit)
    throw new HttpError(413, 'The upload exceeds the configured size limit.');
}

export async function storeUpload(req, { mediaDir, maxUploadBytes, store }) {
  validateFilename(req.headers['x-filename']);
  let name = '';
  try {
    name = decodeURIComponent(req.headers['x-filename'] || '');
  } catch {
    // already checked by validateFilename
  }
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp3').toLowerCase();
  const isMp4OrM4a = ext === 'm4a' || ext === 'mp4';
  const isWav = ext === 'wav';
  const isMp3 = ext === 'mp3';
  const isAac = ext === 'aac';
  const contentType = (req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (isMp4OrM4a) {
    if (!['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'video/mp4'].includes(contentType)) {
      throw new HttpError(415, 'Upload an MP4/M4A using Content-Type: audio/mp4 or video/mp4.');
    }
  } else if (isWav) {
    if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(contentType)) {
      throw new HttpError(415, 'Upload a WAV using Content-Type: audio/wav.');
    }
  } else if (isAac) {
    if (!['audio/aac', 'audio/x-aac'].includes(contentType)) {
      throw new HttpError(415, 'Upload an AAC using Content-Type: audio/aac.');
    }
  } else if (isMp3) {
    if (contentType !== 'audio/mpeg') {
      throw new HttpError(415, 'Upload an MP3 using Content-Type: audio/mpeg.');
    }
  }
  if (
    req.headers['content-encoding'] &&
    req.headers['content-encoding'].toLowerCase() !== 'identity'
  ) {
    throw new HttpError(415, 'Compressed upload bodies are not supported.');
  }
  declaredSize(req, maxUploadBytes);
  await mkdir(mediaDir, { recursive: true });
  const uploadsDir = path.join(mediaDir, 'uploads');
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  const directory = await lstat(uploadsDir);
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new HttpError(500, 'Upload storage is unavailable.');
  const filename = `${randomUUID()}.${ext}`;
  const temporary = path.join(uploadsDir, `.${randomUUID()}.part`);
  const destination = path.join(uploadsDir, filename);
  let handle;
  let moved = false;
  let committed = false;
  try {
    handle = await open(temporary, 'wx+', 0o600);
    let size = 0;
    let prefix = Buffer.alloc(0);
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxUploadBytes)
        throw new HttpError(413, 'The upload exceeds the configured size limit.');
      if (prefix.length < 32)
        prefix = Buffer.concat([prefix, chunk.subarray(0, 32 - prefix.length)]);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        if (!bytesWritten) throw new Error('Unable to write upload.');
        offset += bytesWritten;
      }
    }
    if (isMp4OrM4a) {
      if (!plausibleM4a(prefix, size))
        throw new HttpError(400, 'The file does not contain a plausible M4A/MP4 audio header.');
    } else if (isWav) {
      if (!plausibleWav(prefix, size))
        throw new HttpError(400, 'The file does not contain a plausible WAV audio header.');
    } else if (isMp3) {
      const offset = mp3FrameOffset(prefix, size);
      let audioHeader = prefix;
      if (offset !== null && offset > 0) {
        // Skip ID3 metadata with one bounded read instead of buffering the tag.
        audioHeader = Buffer.alloc(4);
        const { bytesRead } = await handle.read(audioHeader, 0, 4, offset);
        if (bytesRead !== 4) audioHeader = Buffer.alloc(0);
      }
      if (offset === null || !plausibleMp3(audioHeader, size - offset))
        throw new HttpError(400, 'The file does not contain a plausible MP3 audio header.');
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    moved = true;
    await syncDirectory(uploadsDir);
    await store.addUpload(filename);
    committed = true;
    return `/media/uploads/${filename}`;
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (moved && !committed)
      await unlink(destination).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
}
