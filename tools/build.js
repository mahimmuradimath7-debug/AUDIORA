import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const frontendDir = path.join(root, 'frontend');
const mediaDir = path.join(root, 'media');

console.log('Building Audiora static output for Vercel…');

// 1. Create clean public directory
mkdirSync(publicDir, { recursive: true });

// 2. Copy all frontend static assets (html, css, js, assets, etc.)
cpSync(frontendDir, publicDir, { recursive: true });

// 3. Copy bundled media files
const publicMediaDir = path.join(publicDir, 'media');
mkdirSync(publicMediaDir, { recursive: true });
cpSync(path.join(mediaDir, 'audiora-preview.mp3'), path.join(publicMediaDir, 'audiora-preview.mp3'));

console.log('Build completed successfully: assets copied to public/');
