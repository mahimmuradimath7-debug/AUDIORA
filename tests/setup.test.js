import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('setup creates a private configuration without printing its token or replacing it', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'audiora-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'tools'));
  await copyFile(new URL('../tools/setup.js', import.meta.url), path.join(root, 'tools/setup.mjs'));
  await copyFile(new URL('../.env.example', import.meta.url), path.join(root, '.env.example'));
  const run = () =>
    spawnSync(process.execPath, [path.join(root, 'tools/setup.mjs')], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0);
  const configuration = await readFile(path.join(root, '.env'), 'utf8');
  const token = /^AUDIORA_ADMIN_TOKEN=([a-f0-9]{64})$/m.exec(configuration)?.[1];
  assert.ok(token);
  assert.ok(!first.stdout.includes(token));
  assert.ok(!first.stderr.includes(token));
  const second = run();
  assert.equal(second.status, 1);
  assert.match(second.stderr, /already exists/);
  assert.equal(await readFile(path.join(root, '.env'), 'utf8'), configuration);
});
