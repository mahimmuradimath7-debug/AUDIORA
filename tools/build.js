import { cpSync, existsSync, mkdirSync } from 'node:fs';
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

const previewSrc = path.join(mediaDir, 'audiora-preview.mp3');
if (existsSync(previewSrc)) {
  cpSync(previewSrc, path.join(publicMediaDir, 'audiora-preview.mp3'));
}

// 4. Copy uploaded media (e.g. published Kannada podcast episodes)
const uploadsSrcDir = path.join(mediaDir, 'uploads');
const uploadsDestDir = path.join(publicMediaDir, 'uploads');
mkdirSync(uploadsDestDir, { recursive: true });

if (existsSync(uploadsSrcDir)) {
  cpSync(uploadsSrcDir, uploadsDestDir, { recursive: true });
}

// Ensure ISRO podcasts and Rajasthan Files podcasts are present in uploads
const mappedFiles = [
  {
    src: path.join(mediaDir, 'ISRO', 'ಸೈಕಲ್_ನಿಂದ_ಚಂದ್ರಯಾನದವರೆಗೆ_ಇಸ್ರೋದ_ಅಸಾಧಾರಣ_ಪಯಣ.m4a'),
    destName: '9ba847d1-7cee-4767-8186-32f4b2e809b7.m4a',
  },
  {
    src: path.join(mediaDir, 'ISRO', 'Hindi', 'साइकिल_से_चांद_तक_इसरो_का_सफर.m4a'),
    destName: '93b9a78e-d1ed-4628-b396-0f46923c834e.m4a',
  },
  {
    src: path.join(mediaDir, 'ISRO', 'english', 'How_India_Reached_Mars_From_Bicycles.m4a'),
    destName: 'a2067ee6-cb12-43e0-a30b-b3db425a3e32.m4a',
  },
  {
    src: path.join(mediaDir, 'Rajastan files', 'bhangar fort', 'english', 'Why_Bhangarh_Fort_Closes_at_Sunset.m4a'),
    destName: 'b6b8a659-c371-459c-ae05-207daac78382.m4a',
  },
  {
    src: path.join(mediaDir, 'Rajastan files', 'bhangar fort', 'hindi', 'भानगढ़_किले_की_तबाही_का_सच.m4a'),
    destName: '776e53b7-c5d9-4214-8e3f-ab68ec026774.m4a',
  },
  {
    src: path.join(mediaDir, 'Rajastan files', 'bhangar fort', 'kannada', 'ಭಾನಗಢ_ಕೋಟೆ_ಪತನದ_ಅಸಲಿ_ಸತ್ಯ.m4a'),
    destName: 'fa60525c-3da0-4188-af11-f375b83fa562.m4a',
  },
];

for (const { src, destName } of mappedFiles) {
  const destUpload = path.join(uploadsDestDir, destName);
  if (existsSync(src) && !existsSync(destUpload)) {
    cpSync(src, destUpload);
    if (!existsSync(path.join(uploadsSrcDir, destName))) {
      mkdirSync(uploadsSrcDir, { recursive: true });
      cpSync(src, path.join(uploadsSrcDir, destName));
    }
  }
}

// 5. Copy media folders (ISRO, youtube, Rajastan files)
for (const sub of ['ISRO', 'youtube', 'Rajastan files']) {
  const src = path.join(mediaDir, sub);
  const dest = path.join(publicMediaDir, sub);
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

console.log('Build completed successfully: assets copied to public/');
