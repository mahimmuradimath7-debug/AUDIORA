import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SEED_EPISODES } from './catalogue.js';
import { HttpError, UPLOAD_URL, UUID_PATTERN, validateEpisode } from './validation.js';

const uuid = new RegExp(`^${UUID_PATTERN}$`);
const MAX_CATALOGUE_BYTES = 16 * 1024 * 1024;

export async function syncDirectory(directory) {
  // Windows does not support POSIX directory fsync; the snapshot itself is still synced.
  if (process.platform === 'win32') return;
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } catch (error) {
    // Some filesystems cannot fsync directories; the file itself is always synced.
    if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes(error.code)) throw error;
  } finally {
    await handle.close();
  }
}

function validState(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.episodes) ||
    !Array.isArray(value.uploads)
  )
    return false;
  if (
    value.uploads.some(
      (name) => typeof name !== 'string' || !UPLOAD_URL.test(`/media/uploads/${name}`),
    )
  )
    return false;
  if (new Set(value.uploads).size !== value.uploads.length) return false;
  const ids = new Set();
  try {
    for (const episode of value.episodes) {
      const { id, publishedAt, demo, featured, ...metadata } = episode;
      validateEpisode(metadata);
      const isCloud =
        typeof metadata.audioUrl === 'string' && metadata.audioUrl.startsWith('https://');
      const uploadMatch = UPLOAD_URL.exec(metadata.audioUrl);
      if (
        !uuid.test(id) ||
        ids.has(id) ||
        demo !== false ||
        featured !== false ||
        typeof publishedAt !== 'string' ||
        !Number.isFinite(Date.parse(publishedAt)) ||
        (!isCloud && (!uploadMatch || !value.uploads.includes(uploadMatch[1])))
      )
        return false;
      ids.add(id);
    }
  } catch {
    return false;
  }
  return true;
}

/** Single-process store: each mutation serializes a complete, atomically replaced snapshot. */
export function createStore(dataDir) {
  const filename = path.join(dataDir, 'catalog.json');
  let state;
  let loaded;
  let queue = Promise.resolve();

  function load() {
    loaded ??= (async () => {
      let handle;
      try {
        const stat = await lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CATALOGUE_BYTES)
          throw new Error('Invalid catalogue file.');
        handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
        const parsed = JSON.parse(await handle.readFile('utf8'));
        if (!validState(parsed)) throw new Error('Invalid catalogue data.');
        state = parsed;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        state = { version: 1, episodes: [], uploads: [] };
      } finally {
        await handle?.close();
      }
    })();
    return loaded;
  }

  async function persist(next) {
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_CATALOGUE_BYTES)
      throw new HttpError(
        507,
        'The local catalogue is full. Archive unused recordings before publishing more.',
      );
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(dataDir, `.catalog-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, filename);
      // Commit immediately after rename, including when a later directory sync fails.
      state = next;
      await syncDirectory(dataDir);
    } finally {
      await handle?.close();
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  function mutate(operation) {
    const result = queue.then(async () => {
      await load();
      return operation();
    });
    queue = result.catch(() => {});
    return result;
  }

  return {
    async list() {
      await load();
      return [...state.episodes, ...SEED_EPISODES];
    },
    async ownsUpload(name) {
      await load();
      return state.uploads.includes(name) || (Boolean(process.env.VERCEL) && UPLOAD_URL.test(`/media/uploads/${name}`));
    },
    addUpload(name) {
      return mutate(async () => {
        if (!UPLOAD_URL.test(`/media/uploads/${name}`))
          throw new HttpError(400, 'Invalid upload path.');
        await persist({ ...state, uploads: [...state.uploads, name] });
      });
    },
    publish(metadata, verifyFile) {
      return mutate(async () => {
        const isCloud = typeof metadata.audioUrl === 'string' && metadata.audioUrl.startsWith('https://');
        if (!isCloud) {
          const name = UPLOAD_URL.exec(metadata.audioUrl)?.[1];
          const isVercel = Boolean(process.env.VERCEL);
          if (!name || (!state.uploads.includes(name) && !isVercel))
            throw new HttpError(400, 'This audio has not been uploaded to this server.');
          if (!isVercel) {
            await verifyFile(name);
          } else {
            try {
              await verifyFile(name);
            } catch {
              // On Vercel, separate lambda instances might not share /tmp
            }
          }
        }
        const episode = {
          ...metadata,
          id: randomUUID(),
          publishedAt: new Date().toISOString(),
          featured: false,
          demo: false,
        };
        await persist({ ...state, episodes: [episode, ...state.episodes] });
        return episode;
      });
    },
  };
}
