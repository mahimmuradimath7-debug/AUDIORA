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
    const isVideo = /\.mp4$/i.test(file.name) || file.type?.startsWith('video/');
    const media = isVideo ? document.createElement('video') : new Audio();
    const url = URL.createObjectURL(file);
    let resolved = false;
    const cleanup = () => {
      clearTimeout(timeout);
      media.onloadedmetadata = media.ondurationchange = media.onerror = null;
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
    };
    const checkDuration = () => {
      const duration = media.duration;
      if (Number.isFinite(duration) && duration > 0 && duration <= 86400) {
        resolved = true;
        cleanup();
        resolve(duration);
        return true;
      }
      return false;
    };
    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(
          new Error(
            'We couldn’t read this audio recording’s duration in time. Please try another file.',
          ),
        );
      }
    }, 60000);
    media.preload = 'metadata';
    media.onloadedmetadata = () => checkDuration();
    media.ondurationchange = () => checkDuration();
    media.onerror = () => {
      if (resolved) return;
      cleanup();
      if (!isVideo) {
        // Fallback: try video element for MP4 containers that Audio() rejected
        const v = document.createElement('video');
        const vUrl = URL.createObjectURL(file);
        let vResolved = false;
        const vCleanup = () => {
          clearTimeout(vTimeout);
          v.onloadedmetadata = v.ondurationchange = v.onerror = null;
          v.removeAttribute('src');
          v.load();
          URL.revokeObjectURL(vUrl);
        };
        const vCheck = () => {
          const d = v.duration;
          if (Number.isFinite(d) && d > 0 && d <= 86400) {
            vResolved = true;
            vCleanup();
            resolve(d);
            return true;
          }
          return false;
        };
        const vTimeout = setTimeout(() => {
          if (!vResolved) {
            vCleanup();
            reject(new Error('We couldn’t read this audio recording’s duration. Try another recording.'));
          }
        }, 30000);
        v.preload = 'metadata';
        v.onloadedmetadata = () => vCheck();
        v.ondurationchange = () => vCheck();
        v.onerror = () => {
          if (vResolved) return;
          vCleanup();
          reject(new Error('This file doesn’t appear to be a playable audio recording. Please choose another.'));
        };
        v.src = vUrl;
        return;
      }
      reject(new Error('This file doesn’t appear to be a playable audio recording. Please choose another.'));
    };
    media.src = url;
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
      `<dialog id="studio-dialog" class="studio-dialog" aria-labelledby="studio-heading"><div class="dialog-heading"><div><p class="eyebrow">YOUR VOICE BELONGS HERE</p><h2 id="studio-heading">Creator Studio<span class="violet-period">.</span></h2></div><button class="icon-button" data-close-dialog aria-label="Close Creator Studio">${icon('close')}</button></div><p class="dialog-intro">Make something worth tuning into. Publish your own recording to this Audiora collection.</p><div id="studio-config" class="studio-guidance" role="status">Checking whether publishing is available…</div><form id="studio-form"><fieldset id="studio-fields" disabled><div class="studio-step"><span>01</span><h3>Your recording</h3><small>Local MP3, M4A, MP4 or WAV audio</small></div><label class="upload-zone" for="studio-file">${icon('upload')}<strong id="file-label">Choose your audio recording</strong><span id="file-hint">MP3, M4A, MP4 or WAV · checking upload size limit…</span><input type="file" id="studio-file" name="file" accept=".mp3,.m4a,.mp4,.wav,.aac,.ogg,.flac,.webm,audio/*,video/mp4" required><span class="file-choose">Choose a file ${icon('plus')}</span></label><p id="file-status" class="field-hint" role="status">Duration is read directly from your audio file.</p><div class="studio-step"><span>02</span><h3>The story behind the sound</h3></div><div class="form-grid"><label class="full-field">Episode title<input name="title" type="text" maxlength="160" required placeholder="A title that makes someone lean in"></label><label>Show name<input name="show" type="text" maxlength="120" required placeholder="The name of your podcast"></label><label>Host / creator<input name="host" type="text" maxlength="100" required placeholder="Your name"></label><label class="full-field">Episode description<textarea name="description" rows="3" maxlength="2000" required placeholder="What’s the story? Give your listeners a little way in."></textarea></label><label>Language<select name="language"><option value="kn">ಕನ್ನಡ · Kannada</option><option value="hi">हिन्दी · Hindi</option><option value="en" selected>English</option></select></label><label>Category<select name="category"><option>Culture</option><option>Stories</option><option>Mindfulness</option><option>Technology</option><option>Creativity</option><option>Life</option><option>Horror</option></select></label><label>Mood<select name="mood"><option>Curious</option><option>Unwind</option><option>Inspired</option></select></label><label>Cover artwork<select name="artwork" id="studio-artwork"><option value="orbit">Violet orbit</option><option value="sunrise">Golden horizon</option><option value="botanical">Room to grow</option><option value="waves">Quiet waves</option><option value="city">Between the lines</option><option value="bloom">A fresh bloom</option></select></label></div><div class="artwork-preview"><img id="studio-art-preview" src="/assets/orbit.svg" alt="Selected original cover artwork"><span>An original Audiora cover, ready for your story.<br>Your title and show name appear alongside the artwork.</span></div><div class="studio-step"><span>03</span><h3>Ready for the world</h3></div><label class="token-label">Publishing token<input id="studio-token" name="token" type="password" required minlength="24" autocomplete="off" spellcheck="false" placeholder="Enter your server’s admin token" aria-describedby="token-hint"></label><p id="token-hint" class="field-hint">Provided by your server administrator. Kept only in memory and cleared when you close this window. This is not an account or sign-in.</p><div class="studio-submit-row"><p>Publish only recordings you have the right to share.<br>Publishing adds your episode to this server’s collection.</p><button class="button button-violet" id="studio-submit" type="submit">Publish episode ${icon('arrow-up-right')}</button></div></fieldset><div id="studio-status" class="studio-status" role="status" hidden></div></form><p class="studio-storage-note">Audio uploads are stored before publishing. If publication fails, the uploaded file remains on the server; your administrator can remove unused uploads.</p></dialog>`,
    );
    this.dialog = $('#studio-dialog');
    setupDialog(this.dialog);
  }

  bindEvents() {
    $$('.creator-open').forEach((button) =>
      button.addEventListener('click', () => {
        openDialog(this.dialog);
        const savedToken = sessionStorage.getItem('audiora_token');
        if (savedToken && !$('#studio-token').value) {
          $('#studio-token').value = savedToken;
        }
      }),
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
      const cloudNotice = config?.supabase?.enabled
        ? '<span class="studio-cloud-badge">⚡ Supabase Cloud Connected</span>'
        : '';
      const vercelNotice = config?.isVercel
        ? '<p class="field-hint" style="margin-top:4px;">Hosted on Vercel Serverless. Large recordings stream directly via cloud storage.</p>'
        : '';
      status.innerHTML = `${icon('check')}<div><strong>The studio is ready for your story.</strong><p>You’ll need this server’s publishing token to upload and publish. ${cloudNotice}</p>${vercelNotice}</div>`;
    } else if (config) {
      status.innerHTML = `${icon('info')}<div><strong>Creator Studio is in preview mode.</strong><p>To enable publishing, set <code>AUDIORA_ADMIN_TOKEN</code> (at least 24 characters) in your environment variables (or Vercel Project Settings) and redeploy. You can keep exploring and listening in the meantime.</p></div>`;
    } else status.textContent = 'Checking whether publishing is available…';
    $('#file-hint').textContent = config
      ? `MP3, M4A, MP4 or WAV audio · up to ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB`
      : 'MP3, M4A, MP4 or WAV · checking upload size limit…';
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
      status.textContent = 'Choose an MP3, M4A, MP4 or WAV to begin.';
      $('#studio-submit').disabled = false;
      return;
    }
    try {
      if (!/\.(?:mp3|m4a|mp4|wav|aac|ogg|flac|webm)$/i.test(file.name))
        throw new Error('Please choose a file with an .mp3, .m4a, .mp4, or .wav extension.');
      if (
        file.name.length > 240 ||
        /[/\\\u0000-\u001f\u007f]/u.test(file.name) ||
        file.name.startsWith('.')
      )
        throw new Error('Use a plain audio filename under 240 characters.');
      const allowedTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/x-mp3',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/aac',
        'video/mp4',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/ogg',
        'audio/flac',
        'audio/webm',
      ];
      if (
        file.type &&
        !allowedTypes.includes(file.type) &&
        !file.type.startsWith('audio/') &&
        !file.type.startsWith('video/mp4')
      )
        throw new Error('Please choose an MP3, M4A, MP4 or WAV audio file, not another format.');
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
    try {
      sessionStorage.setItem('audiora_token', token);
    } catch {}
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
        const ext = (this.file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp3').toLowerCase();
        let contentType = 'audio/mpeg';
        if (ext === 'm4a') contentType = 'audio/mp4';
        else if (ext === 'mp4') contentType = 'video/mp4';
        else if (ext === 'wav') contentType = 'audio/wav';
        else if (ext === 'aac') contentType = 'audio/aac';
        else if (ext === 'ogg') contentType = 'audio/ogg';
        else if (ext === 'flac') contentType = 'audio/flac';
        else if (ext === 'webm') contentType = 'audio/webm';

        let audioUrl = null;
        const isVercel = this.config?.isVercel || window.location.hostname.includes('vercel.app');
        const isLargeFile = this.file.size > 4 * 1024 * 1024;

        if (this.config?.supabase?.enabled && (isVercel || isLargeFile)) {
          this.setStatus('Step 1 of 2 · Uploading to cloud storage…');
          try {
            audioUrl = await this.uploadToSupabase(this.file, contentType, ext);
          } catch (cloudErr) {
            console.warn('Cloud storage direct upload fallback:', cloudErr.message);
            if (isVercel && isLargeFile) {
              throw new Error(
                `Your file (${(this.file.size / 1024 / 1024).toFixed(1)} MB) exceeds Vercel’s 4.5 MB serverless limit, so direct cloud upload was attempted but failed: ${cloudErr.message}. Ensure your Supabase 'audio' storage bucket is created (see docs/supabase-schema.sql).`,
              );
            }
          }
        }

        if (!audioUrl) {
          this.setStatus('Step 1 of 2 · Uploading your audio to server…');
          const uploaded = await api('/api/uploads', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': contentType,
              'X-Filename': encodeURIComponent(this.file.name),
            },
            body: this.file,
          });
          audioUrl = uploaded.audioUrl;
        }

        this.upload = audioUrl;
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

  async uploadToSupabase(file, contentType, ext) {
    const { url, key } = this.config?.supabase || {};
    if (!url || !key) throw new Error('Supabase credentials not configured.');
    const fileId = `${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)}.${ext}`;
    const buckets = ['audio', 'audiora-media', 'recordings'];
    let lastError = null;

    for (const bucket of buckets) {
      try {
        const uploadUrl = `${url}/storage/v1/object/${bucket}/${fileId}`;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': contentType,
            'x-upsert': 'true',
          },
          body: file,
        });

        if (response.ok) {
          return `${url}/storage/v1/object/public/${bucket}/${fileId}`;
        }
        const errorData = await response.json().catch(() => ({}));
        lastError = new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Could not upload to Supabase storage bucket.');
  }
}
