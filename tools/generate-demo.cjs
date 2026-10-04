/* Original Audiora ambient composition. No samples or third-party recordings.
 * Optional development tool: npm ci && npm run audio:generate
 * lamejs is used only for MP3 encoding, never by the running website.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
const library = path.join(path.dirname(require.resolve('lamejs/package.json')), 'lame.all.js');
vm.runInContext(fs.readFileSync(library, 'utf8'), context);
const encoder = new context.lamejs.Mp3Encoder(2, 44100, 128);
const sampleRate = 44100;
const seconds = 30;
const block = 1152;
const output = [];
const chord = [130.8128, 164.8138, 195.9977, 261.6256];
for (let start = 0; start < seconds * sampleRate; start += block) {
  const length = Math.min(block, seconds * sampleRate - start);
  const left = new Int16Array(length);
  const right = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const t = (start + index) / sampleRate;
    const fade = Math.min(1, t / 3, (seconds - t) / 4);
    const swell = 0.78 + 0.22 * Math.sin((t * Math.PI) / 8);
    let l = 0;
    let r = 0;
    chord.forEach((frequency, voice) => {
      const amplitude = 0.033 * (1 + 0.13 * Math.sin(t * 0.5 + voice));
      l += Math.sin(2 * Math.PI * frequency * t) * amplitude;
      r += Math.sin(2 * Math.PI * (frequency + 0.12) * t + voice * 0.2) * amplitude;
    });
    const noteTime = t % 5;
    const note = [523.251, 659.255, 783.991, 587.33, 659.255, 523.251][Math.floor(t / 5)];
    const envelope = Math.min(1, noteTime * 5) * Math.exp(-noteTime * 1.3);
    const chime = Math.sin(2 * Math.PI * note * t) * envelope * 0.055;
    left[index] = Math.round((l * swell + chime) * fade * 32767);
    right[index] = Math.round((r * swell + chime * 0.8) * fade * 32767);
  }
  output.push(Buffer.from(encoder.encodeBuffer(left, right)));
}
output.push(Buffer.from(encoder.flush()));
const destination = path.resolve(__dirname, '../media/audiora-preview.mp3');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, Buffer.concat(output));
console.log('Generated media/audiora-preview.mp3 — original 30-second ambient demo.');
