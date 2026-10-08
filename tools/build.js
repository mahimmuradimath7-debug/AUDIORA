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
  {
    src: path.join(mediaDir, 'Rajastan files', 'Kuldhara', 'english', 'Why_Kuldhara_Was_Abandoned_Overnight.m4a'),
    destName: 'c7b4412c-450a-49c8-835a-617ea05f03ad.m4a',
  },
  {
    src: path.join(mediaDir, 'Rajastan files', 'Kuldhara', 'hindi', 'कुल्धरा_के_वीरान_होने_का_सच.m4a'),
    destName: '6ce99580-394a-4a3a-8191-2de8cb65f30f.m4a',
  },
  {
    src: path.join(mediaDir, 'Rajastan files', 'Kuldhara', 'kannada', 'ಕುಲ್ಧಾರಾ_ಗ್ರಾಮ_ರಾತ್ರೋರಾತ್ರಿ_ಖಾಲಿಯಾದ_ಅಸಲಿ_ಸತ್ಯ.m4a'),
    destName: 'a6c18f71-eb4b-4762-a3d0-fbbad190685f.m4a',
  },
  {
    src: path.join(mediaDir, 'Blocked', 'English', 'Why_Being_Blocked_Hurts_So_Much.m4a'),
    destName: '06885e4e-9c59-4710-98ad-db8faade71e0.m4a',
  },
  {
    src: path.join(mediaDir, 'Blocked', 'hindi', 'एकतरफा_प्यार_में_ब्लॉक_होने_का_दर्द.m4a'),
    destName: 'bc172835-f53e-4d24-a358-1020bd61c06b.m4a',
  },
  {
    src: path.join(mediaDir, 'Blocked', 'kannada', 'ಕಾರಣವಿಲ್ಲದೆ_ಬ್ಲಾಕ್_ಆದ_ರಾಹುಲ್_ನ_ಪ್ರೇಮಕಥೆ.m4a'),
    destName: '25bd2d29-180e-4b11-82a2-cbd41c6a2693.m4a',
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

// 5. Copy media folders (ISRO, youtube, Rajastan files, Blocked)
for (const sub of ['ISRO', 'youtube', 'Rajastan files', 'Blocked']) {
  const src = path.join(mediaDir, sub);
  const dest = path.join(publicMediaDir, sub);
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

console.log('Build completed successfully: assets copied to public/');
