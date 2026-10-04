import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
try {
  const example = await readFile(new URL('.env.example', root), 'utf8');
  const config = example.replace(
    /^AUDIORA_ADMIN_TOKEN=$/m,
    `AUDIORA_ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
  );
  await writeFile(new URL('.env', root), config, { flag: 'wx', mode: 0o600 });
  console.log('Created private .env. Restart the server to enable publishing.');
  console.log(
    'Open .env privately to copy the publishing token into Creator Studio. Do not share or commit it.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.error('.env already exists. It was not changed. Edit it privately if needed.');
  else console.error('Could not create .env. Check that the project folder is writable.');
  process.exitCode = 1;
}
