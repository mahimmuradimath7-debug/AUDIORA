import {
  $,
  $$,
  api,
  artwork,
  escapeHtml as esc,
  time,
  toast,
  openDialog,
  setupDialog,
} from './utils.js';
import { icon } from './icons.js';

function readDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      clearTimeout(timeout);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('We couldn’t read this audio recording’s duration. Try another recording.'));
    }, 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      audio.onloadedmetadata = audio.onerror = null;
      cleanup();
      if (Number.isFinite(duration) && duration > 0 && duration <= 86400) resolve(duration);
      else
        reject(new Error('Choose an audio recording with a readable duration between 1 second and 24 hours.'));
    };
    audio.onerror = () => {
      audio.onloadedmetadata = audio.onerror = null;
      cleanup();
      reject(new Error('This file doesn’t appear to be a playable audio recording. Please choose another.'));
    };
    audio.src = url;
  });
}

export class Studio {
  constructor(onPublished, retryConfig) {
    this.onPublished = onPublished;
    this.retryConfig = retryConfig;
    this.config = null;
    this.file = null;
    this.duration = null;
    this.upload = null;
    this.busy = false;
    this.fileVersion = 0;
    this.createDialog();
    this.bindEvents();
  }

  createDialog() {
    $('#dialog-root').insertAdjacentHTML(
      'beforeend',
      `<dialog id="studio-dialog" class="studio-dialog" aria-labelledby="studio-heading"><div class="dialog-heading"><div><p class="eyebrow">YOUR VOICE BELONGS HERE</p><h2 id="studio-heading">Creator Studio<span class="violet-period">.</span></h2></div><button class="icon-button" data-close-dialog aria-label="Close Creator Studio">${icon('close')}</button></div><p class="dialog-intro">Make something worth tuning into. Publish your own recording to this Audiora collection.</p><div id="studio-config" class="studio-guidance" role="status">Checking whether publishing is available…</div><form id="studio-form"><fieldset id="studio-fields" disabled><div class="studio-step"><span>01</span><h3>Your recording</h3><small>Local MP3 or M4A audio</small></div><label class="upload-zone" for="studio-file">${icon('upload')}<strong id="file-label">Choose your audio recording</strong><span id="file-hint">MP3 or M4A · checking upload size limit…</span><input type="file" id="studio-file" name="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac" required><span class="file-choose">Choose a file ${icon('plus')}</span></label><p id="file-status" class="field-hint" role="status">Duration is read directly from your audio file.</p><div class="studio-step"><span>02</span><h3>The story behind the sound</h3></div><div class="form-grid"><label class="full-field">Episode title<input name="title" type="text" maxlength="160" required placeholder="A title that makes someone lean in"></label><label>Show name<input name="show" type="text" maxlength="120" required placeholder="The name of your podcast"></label><label>Host / creator<input name="host" type="text" maxlength="100" required placeholder="Your name"></label><label class="full-field">Episode description<textarea name="description" rows="3" maxlength="2000" required placeholder="What’s the story? Give your listeners a little way in."></textarea></label><label>Language<select name="language"><option value="kn">ಕನ್ನಡ · Kannada</option><option value="hi">हिन्दी · Hindi</option><option value="en" selected>English</option></select></label><label>Category<select name="category"><option>Culture</option><option>Stories</option><option>Mindfulness</option><option>Technology</option><option>Creativity</option><option>Life</option></select></label><label>Mood<select name="mood"><option>Curious</option><option>Unwind</option><option>Inspired</option></select></label><label>Cover artwork<select name="artwork" id="studio-artwork"><option value="orbit">Violet orbit</option><option value="sunrise">Golden horizon</option><option value="botanical">Room to grow</option><option value="waves">Quiet waves</option><option value="city">Between the lines</option><option value="bloom">A fresh bloom</option></select></label></div><div class="artwork-preview"><img id="studio-art-preview" src="/assets/orbit.svg" alt="Selected original cover artwork"><span>An original Audiora cover, ready for your story.<br>Your title and show name appear alongside the artwork.</span></div><div class="studio-step"><span>03</span><h3>Ready for the world</h3></div><label class="token-label">Publishing token<input id="studio-token" name="token" type="password" required minlength="24" autocomplete="off" spellcheck="false" placeholder="Enter your server’s admin token" aria-describedby="token-hint"></label><p id="token-hint" class="field-hint">Provided by your server administrator. Kept only in memory and cleared when you close this window. This is not an account or sign-in.</p><div class="studio-submit-row"><p>Publish only recordings you have the right to share.<br>Publishing adds your episode to this server’s collection.</p><button class="button button-violet" id="studio-submit" type="submit">Publish episode ${icon('arrow-up-right')}</button></div></fieldset><div id="studio-status" class="studio-status" role="status" hidden></div></form><p class="studio-storage-note">Audio uploads are stored before publishing. If publication fails, the uploaded file remains on the server; your administrator can remove unused uploads.</p></dialog>`,
    );
    this.dialog = $('#studio-dialog');
    setupDialog(this.dialog);
  }

  bindEvents() {
    $$('.creator-open').forEach((button) =>
      button.addEventListener('click', () => openDialog(this.dialog)),
    );
    this.dialog.addEventListener('close', () => {
      $('#studio-token').value = '';
    });
    $('#studio-artwork').addEventListener('change', (event) => {
      $('#studio-art-preview').src = artwork(event.target.value);
    });
    $('#studio-file').addEventListener('change', () => this.chooseFile());
    $('#studio-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.publish();
    });
    $('#studio-config').addEventListener('click', (event) => {
      if (event.target.closest('[data-retry-config]')) this.retryConfig();
    });
  }

  setConfig(config, error) {
    this.config = config;
    $('#studio-fields').disabled = !config?.uploadsEnabled || this.busy;
    const status = $('#studio-config');
    status.classList.toggle('is-enabled', !!config?.uploadsEnabled);
    if (error) {
      status.innerHTML = `${icon('info')}<div><strong>Publishing settings couldn’t be loaded.</strong><p>${esc(error)}</p><button type="button" class="text-button" data-retry-config>Try again ${icon('refresh')}</button></div>`;
    } else if (config?.uploadsEnabled) {
      status.innerHTML = `${icon('check')}<div><strong>The studio is ready for your story.</strong><p>You’ll need this server’s publishing token to upload and publish.</p></div>`;
    } else if (config) {
      status.innerHTML = `${icon('info')}<div><strong>Creator Studio is in preview mode.</strong><p>To enable publishing, the server administrator must set <code>AUDIORA_ADMIN_TOKEN</code> to at least 24 characters and restart the server. You can keep exploring and listening in the meantime.</p></div>`;
    } else status.textContent = 'Checking whether publishing is available…';
    $('#file-hint').textContent = config
      ? `MP3 or M4A audio · up to ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB`
      : 'MP3 or M4A · checking upload size limit…';
  }

  async chooseFile() {
    const version = ++this.fileVersion;
    this.file = null;
    this.duration = null;
    this.upload = null;
    const file = $('#studio-file').files[0];
    const status = $('#file-status');
    status.classList.remove('is-error');
    $('#studio-submit').disabled = true;
    $('#studio-status').hidden = true;
    $('#file-label').textContent = file?.name || 'Choose your audio recording';
    if (!file) {
      status.textContent = 'Choose an MP3 or M4A to begin.';
      $('#studio-submit').disabled = false;
      return;
    }
    try {
      if (!/\.(?:mp3|m4a)$/i.test(file.name))
        throw new Error('Please choose a file with an .mp3 or .m4a extension.');
      if (
        file.name.length > 240 ||
        /[/\\\u0000-\u001f\u007f]/u.test(file.name) ||
        file.name.startsWith('.')
      )
        throw new Error('Use a plain MP3 or M4A filename under 240 characters.');
      const allowedTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/x-mp3',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/aac',
      ];
      if (file.type && !allowedTypes.includes(file.type))
        throw new Error('Please choose an MP3 or M4A audio file, not another format.');
      if (!file.size) throw new Error('This file is empty. Choose a playable audio recording.');
      if (file.size > this.config.maxUploadBytes)
        throw new Error(
          `Your file is too large. The limit is ${Math.round(this.config.maxUploadBytes / 1024 / 1024)} MB.`,
        );
      status.textContent = 'Reading your recording’s duration…';
      const duration = await readDuration(file);
      if (version !== this.fileVersion) return;
      this.file = file;
      this.duration = duration;
      status.textContent = `${time(duration)} of audio · ${(file.size / 1024 / 1024).toFixed(2)} MB · ready to publish`;
    } catch (error) {
      if (version !== this.fileVersion) return;
      status.textContent = error.message;
      status.classList.add('is-error');
      $('#studio-file').value = '';
    } finally {
      if (version === this.fileVersion) $('#studio-submit').disabled = false;
    }
  }

  async publish() {
    if (this.busy || !this.config?.uploadsEnabled) return;
    const form = $('#studio-form');
    if (!form.reportValidity()) return;
    if (!this.file || !this.duration) {
      this.setStatus('Choose a valid audio file and wait for its duration to be read.', true);
      return;
    }
    const values = new FormData(form);
    let token = String(values.get('token') || '').trim();
    if (token.length < 24) {
      this.setStatus('The publishing token must be at least 24 characters.', true);
      return;
    }
    const metadata = Object.fromEntries(
      ['title', 'show', 'host', 'description', 'language', 'category', 'mood', 'artwork'].map(
        (key) => [key, String(values.get(key) || '').trim()],
      ),
    );
    metadata.duration = this.duration;
    this.busy = true;
    $('#studio-fields').disabled = true;
    $('#studio-submit').textContent = 'Publishing…';
    try {
      if (!this.upload) {
        this.setStatus('Step 1 of 2 · Uploading your audio…');
        const isM4a = /\.m4a$/i.test(this.file.name);
        const contentType = isM4a ? 'audio/mp4' : 'audio/mpeg';
        const uploaded = await api('/api/uploads', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType,
            'X-Filename': encodeURIComponent(this.file.name),
          },
          body: this.file,
        });
        this.upload = uploaded.audioUrl;
      }
      this.setStatus('Step 2 of 2 · Publishing your episode details…');
      const result = await api('/api/episodes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...metadata, audioUrl: this.upload }),
      });
      this.onPublished(result.episode);
      form.reset();
      this.file = this.duration = this.upload = null;
      $('#studio-art-preview').src = artwork('orbit');
      $('#file-label').textContent = 'Choose your audio recording';
      $('#file-status').textContent = 'Duration is read directly from your audio file.';
      this.setStatus(
        `“${result.episode.title}” is published and ready to listen to. Find it in Discover.`,
      );
      toast('Your episode is live in the collection. Welcome to Audiora.');
    } catch (error) {
      this.setStatus(
        `${error.message}${this.upload ? ' Your audio is uploaded; your details are still here. Retry to finish publishing without uploading again.' : ' Your details are still here. You can try again.'}`,
        true,
      );
    } finally {
      token = '';
      this.busy = false;
      $('#studio-fields').disabled = !this.config?.uploadsEnabled;
      $('#studio-submit').innerHTML = `Publish episode ${icon('arrow-up-right')}`;
    }
  }

  setStatus(message, error = false) {
    const status = $('#studio-status');
    status.hidden = false;
    status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
    status.textContent = message;
  }
}
