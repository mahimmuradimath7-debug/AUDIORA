import {
  $,
  $$,
  artwork,
  escapeHtml as esc,
  time,
  toast,
  openDialog,
  setupDialog,
  rangeFill,
} from './utils.js';
import { icon } from './icons.js';
import { store } from './store.js';

export class Player {
  constructor(getEpisode, getEpisodes) {
    this.getEpisode = getEpisode;
    this.getEpisodes = getEpisodes;
    this.audio = $('#audio');
    this.current = null;
    this.selection = 0;
    this.lastRecorded = 0;
    this.lastVolume = store.state.volume || 0.8;
    this.sleepAt = null;
    this.sleepAtEnd = false;
    this.audio.volume = store.state.volume;
    this.audio.defaultPlaybackRate = store.state.rate;
    this.audio.playbackRate = store.state.rate;
    this.config = null;
    this.createDialogs();
    this.bindEvents();
    this.updatePreferences();
    this.updateQueue();
  }

  setConfig(config) {
    this.config = config;
  }

  createDialogs() {
    $('#dialog-root').insertAdjacentHTML(
      'beforeend',
      `
      <dialog id="focus-dialog" class="focus-dialog" aria-labelledby="focus-heading"><div class="focus-top"><span>${icon('headphones')} JUST YOU AND THE MOMENT</span><button class="icon-button" data-close-dialog aria-label="Close focus listening">${icon('close')}</button></div><div class="focus-layout"><div class="focus-art-wrap"><img id="focus-art" src="/assets/orbit.svg" alt="Episode artwork"><div class="focus-orbit" aria-hidden="true"></div></div><div class="focus-copy"><p class="eyebrow" id="focus-language">YOUR SPACE TO LISTEN</p><h2 id="focus-heading">Find your frequency.</h2><p id="focus-show"></p><p id="focus-description"></p><span id="focus-demo" class="demo-notice">Original ambient demo · not a spoken episode</span><div class="focus-seek"><input id="focus-seek" type="range" min="0" max="30" value="0" step="0.1" aria-label="Seek in focus view"><div><time id="focus-time">0:00</time><time id="focus-duration">0:00</time></div></div><div class="focus-controls"><button class="icon-button" data-player="back" aria-label="Back 15 seconds">${icon('back15')}</button><button class="focus-play play-toggle" data-player="toggle" aria-label="Play">${icon('play')}</button><button class="icon-button" data-player="forward" aria-label="Forward 15 seconds">${icon('forward15')}</button><button class="icon-button" data-player="save" aria-label="Save current episode">${icon('bookmark')}</button></div><p class="focus-hint">A quieter screen. A little more presence.<br><kbd>Space</kbd> play / pause <span>·</span> <kbd>Esc</kbd> return</p></div></div></dialog>
      <dialog id="queue-dialog" class="queue-dialog" aria-labelledby="queue-heading"><div class="dialog-heading"><div><p class="eyebrow">LET ONE GOOD LISTEN LEAD TO ANOTHER</p><h2 id="queue-heading">Up next<span class="violet-period">.</span></h2></div><button class="icon-button" data-close-dialog aria-label="Close listening queue">${icon('close')}</button></div><p class="dialog-intro">Your next listens, in order. Saved on this device.</p><div id="queue-current"></div><div id="queue-list"></div><div class="queue-footer"><span id="queue-summary"></span><button class="text-button" id="queue-clear">Clear queue ${icon('trash')}</button></div></dialog>
      <dialog id="sleep-dialog" class="small-dialog" aria-labelledby="sleep-heading"><div class="dialog-heading"><div><p class="eyebrow">DRIFT OFF AT YOUR OWN PACE</p><h2 id="sleep-heading">A softer ending.</h2></div><button class="icon-button" data-close-dialog aria-label="Close sleep timer">${icon('close')}</button></div><p class="dialog-intro">We’ll pause your audio when the time is up. Keep this tab open for the timer to work.</p><div class="sleep-options"><button data-sleep="5">5 minutes</button><button data-sleep="15">15 minutes</button><button data-sleep="30">30 minutes</button><button data-sleep="60">60 minutes</button><button data-sleep="end">End of this episode</button></div><p id="sleep-status" role="status">No sleep timer set.</p><button id="sleep-cancel" class="button button-secondary" hidden>Turn off timer</button></dialog>`,
    );
    $('#focus-demo').insertAdjacentHTML(
      'afterend',
      '<div id="focus-error" class="focus-error" role="alert" hidden><span></span><button type="button" data-player="retry">Try again</button></div>',
    );
    ['focus', 'queue', 'sleep'].forEach((name) => setupDialog($(`#${name}-dialog`)));
  }

  bindEvents() {
    $('#play-toggle').addEventListener('click', () => this.toggle());
    $('#skip-back').addEventListener('click', () => this.seekBy(-15));
    $('#skip-forward').addEventListener('click', () => this.seekBy(15));
    $('#player-next').addEventListener('click', () => this.next());
    $('#player-shuffle').addEventListener('click', () => this.random());
    $('#player-save').addEventListener('click', () => this.toggleSave());
    $('#speed-button').addEventListener('click', () => this.cycleRate());
    $('#volume-toggle').addEventListener('click', () => this.toggleMute());
    $('#player-volume').addEventListener('input', (event) =>
      this.setVolume(Number(event.target.value)),
    );
    ['player-seek', 'focus-seek'].forEach((id) =>
      $(`#${id}`).addEventListener('input', (event) => this.seek(Number(event.target.value))),
    );
    ['focus-open', 'player-art-button'].forEach((id) =>
      $(`#${id}`).addEventListener('click', () => this.openFocus()),
    );
    $('#queue-open').addEventListener('click', () => {
      this.updateQueue();
      openDialog($('#queue-dialog'));
    });
    $('#queue-clear').addEventListener('click', () => {
      store.set('queue', []);
      toast('Your queue is clear. A fresh start.');
    });
    $('#sleep-open').addEventListener('click', () => openDialog($('#sleep-dialog')));
    $('#sleep-cancel').addEventListener('click', () => this.setSleep(null));
    $$('#sleep-dialog [data-sleep]').forEach((button) =>
      button.addEventListener('click', () => this.setSleep(button.dataset.sleep)),
    );
    $('#focus-dialog').addEventListener('click', (event) => {
      const action = event.target.closest('[data-player]')?.dataset.player;
      if (action === 'toggle') this.toggle();
      if (action === 'back') this.seekBy(-15);
      if (action === 'forward') this.seekBy(15);
      if (action === 'save') this.toggleSave();
      if (action === 'retry') this.retry();
    });
    $('#queue-list').addEventListener('click', (event) => {
      const remove = event.target.closest('[data-queue-remove]');
      const play = event.target.closest('[data-queue-play]');
      if (remove) {
        const buttons = $$('[data-queue-remove]', $('#queue-list'));
        const index = buttons.indexOf(remove);
        store.set(
          'queue',
          store.state.queue.filter((id) => id !== remove.dataset.queueRemove),
        );
        const nextButtons = $$('[data-queue-remove]', $('#queue-list'));
        (
          nextButtons[Math.min(index, nextButtons.length - 1)] ||
          $('#queue-dialog [data-close-dialog]')
        ).focus();
      }
      if (play) this.select(this.getEpisode(play.dataset.queuePlay));
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.resumePosition && this.resumePosition < this.audio.duration - 0.6)
        this.audio.currentTime = this.resumePosition;
      this.resumePosition = 0;
      this.updateTime();
    });
    this.audio.addEventListener('timeupdate', () => {
      this.updateTime();
      if (Date.now() - this.lastRecorded > 1000) this.record();
    });
    ['play', 'pause', 'waiting', 'playing'].forEach((name) =>
      this.audio.addEventListener(name, () => {
        document.body.dataset.buffering = String(name === 'waiting' && !this.audio.paused);
        $('#player').setAttribute('aria-busy', document.body.dataset.buffering);
        this.updatePlayback();
        if (name === 'pause') {
          this.record();
          window.dispatchEvent(new CustomEvent('audiora:progress'));
        }
      }),
    );
    this.audio.addEventListener('ended', () => {
      this.record();
      window.dispatchEvent(new CustomEvent('audiora:progress'));
      if (this.sleepAtEnd) {
        this.setSleep(null);
        toast('End of the episode. Rest easy.');
      } else this.next(false);
    });
    this.audio.addEventListener('error', () => {
      const uploadMatch = /^\/media\/uploads\/([a-zA-Z0-9_\-.]+\.(?:mp3|m4a|mp4|wav|aac|ogg|flac|webm))$/i.exec(
        this.current?.audioUrl || '',
      );
      const supabaseUrl = this.config?.supabase?.url || 'https://maivkyqwjlibilmpgmrk.supabase.co';
      if (uploadMatch && supabaseUrl && !this.audio.src.includes('supabase.co')) {
        this.audio.src = `${supabaseUrl}/storage/v1/object/public/audio/${uploadMatch[1]}`;
        this.audio.load();
        this.play().catch(() => {});
        return;
      }
      this.showError('This audio couldn’t be loaded. Check your connection, then try again.');
    });
    $('#playback-retry').addEventListener('click', () => this.retry());
    $('#playback-error-close').addEventListener('click', () => {
      $('#playback-error').hidden = $('#focus-error').hidden = true;
    });
    window.addEventListener('audiora:store', (event) => {
      if (event.detail.key === 'saved') this.updateSaved();
      if (event.detail.key === 'queue') this.updateQueue();
    });
    window.addEventListener('pagehide', () => this.record());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.record();
      this.checkSleep();
    });
  }

  restore() {
    const current =
      this.getEpisode(store.state.currentId) ||
      this.getEpisodes().find((ep) => ep.featured) ||
      this.getEpisodes()[0];
    if (current) this.select(current, false);
  }

  select(episode, autoplay = true) {
    if (!episode) return;
    if (this.current?.id === episode.id) {
      if (store.state.queue.includes(episode.id))
        store.set(
          'queue',
          store.state.queue.filter((id) => id !== episode.id),
        );
      if (autoplay) this.toggle();
      return;
    }
    this.record();
    this.audio.pause();
    this.current = episode;
    this.selection++;
    this.resumePosition = store.state.progress[episode.id]?.completed
      ? 0
      : store.state.progress[episode.id]?.position || 0;
    // Play local media returned by the catalogue or trusted Supabase cloud audio.
    const isLocal =
      /^\/media\/[a-zA-Z0-9/_\-.]+\.(?:mp3|m4a|mp4|wav|aac|ogg|flac|webm)$/i.test(episode.audioUrl) &&
      !episode.audioUrl.includes('..');
    const isCloud =
      /^https:\/\/[a-zA-Z0-9.-]+\.supabase\.co\/storage\/v1\/object\/public\/[a-zA-Z0-9/_\-.]+\.(?:mp3|m4a|mp4|wav|aac|ogg|flac|webm)$/i.test(
        episode.audioUrl,
      );
    if (!isLocal && !isCloud) {
      this.showError('This episode has an unsupported audio address.');
      return;
    }
    this.audio.src = episode.audioUrl;
    this.audio.defaultPlaybackRate = store.state.rate;
    this.audio.playbackRate = store.state.rate;
    store.set('currentId', episode.id, false);
    if (store.state.queue.includes(episode.id))
      store.set(
        'queue',
        store.state.queue.filter((id) => id !== episode.id),
      );
    $('#playback-error').hidden = $('#focus-error').hidden = true;
    this.updateTrack();
    this.updateTime();
    this.updateQueue();
    this.updatePlayback();
    if (autoplay) this.play();
  }

  async play() {
    if (!this.current) {
      this.select(this.getEpisodes()[0]);
      return;
    }
    const selection = this.selection;
    if (this.audio.ended) this.audio.currentTime = 0;
    try {
      await this.audio.play();
      if (selection === this.selection)
        $('#playback-error').hidden = $('#focus-error').hidden = true;
    } catch (error) {
      if (selection !== this.selection || error.name === 'AbortError') return;
      const uploadMatch = /^\/media\/uploads\/([a-zA-Z0-9_\-.]+\.(?:mp3|m4a|mp4|wav|aac|ogg|flac|webm))$/i.exec(
        this.current?.audioUrl || '',
      );
      const supabaseUrl = this.config?.supabase?.url || 'https://maivkyqwjlibilmpgmrk.supabase.co';
      if (uploadMatch && supabaseUrl && !this.audio.src.includes('supabase.co')) {
        this.audio.src = `${supabaseUrl}/storage/v1/object/public/audio/${uploadMatch[1]}`;
        try {
          await this.audio.play();
          if (selection === this.selection) {
            $('#playback-error').hidden = $('#focus-error').hidden = true;
            return;
          }
        } catch (cloudErr) {
          if (cloudErr.name === 'AbortError') return;
        }
      }
      this.showError(
        error.name === 'NotAllowedError'
          ? 'Your browser paused playback. Press play to start listening.'
          : 'Playback couldn’t start. Check that the audio file is available, then try again.',
      );
    }
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.audio.pause();
  }
  seek(position) {
    if (this.current && Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, position));
      this.updateTime();
      this.record();
    }
  }
  seekBy(seconds) {
    this.seek(this.audio.currentTime + seconds);
  }
  record() {
    if (!this.current || !Number.isFinite(this.audio.duration)) return;
    // Preserve an explicit seek back to zero, but don't invent listening history on first load.
    if (this.audio.currentTime === 0 && !store.state.progress[this.current.id] && this.audio.paused)
      return;
    store.record(this.current.id, this.audio.currentTime, this.audio.duration);
    this.lastRecorded = Date.now();
  }
  random() {
    const episodes = this.getEpisodes().filter((ep) => ep.id !== this.current?.id);
    if (episodes.length) this.select(episodes[Math.floor(Math.random() * episodes.length)]);
    else if (this.current) this.play();
    else toast('The collection isn’t available yet. Try loading it again below.');
  }
  next(manual = true) {
    const next = store.state.queue.map((id) => this.getEpisode(id)).find(Boolean);
    if (next) {
      if (next.id === this.current?.id) {
        store.set(
          'queue',
          store.state.queue.filter((id) => id !== next.id),
        );
        this.seek(0);
        this.play();
      } else this.select(next);
    } else if (manual) toast('Your queue is empty. Add a listen from the collection.');
  }
  enqueue(id) {
    if (store.state.queue.includes(id)) {
      toast('Already waiting in your queue.');
      return;
    }
    store.set('queue', [...store.state.queue, id]);
    toast('Added to your listening queue.');
  }
  toggleSave() {
    if (this.current)
      toast(
        store.toggleSaved(this.current.id)
          ? 'Saved to your library on this device.'
          : 'Removed from your library.',
      );
  }
  showError(message) {
    $('#playback-error span').textContent = message;
    $('#playback-error').hidden = false;
    $('#focus-error span').textContent = message;
    $('#focus-error').hidden = false;
    document.body.dataset.buffering = 'false';
    $('#player').setAttribute('aria-busy', 'false');
    this.updatePlayback();
  }

  retry() {
    if (!this.current) return;
    const episode = this.current;
    this.current = null;
    this.select(episode);
  }

  updateTrack() {
    const episode = this.current;
    if (!episode) return;
    $('#player-title').textContent = episode.title;
    $('#player-title').lang = episode.language;
    $('#player-show').textContent = `${episode.show} · ${episode.host}`;
    $('#player-art').src = artwork(episode.artwork);
    $('#player-art').alt = `${episode.show} artwork`;
    $('#player-demo').textContent = episode.demo
      ? '30-SECOND AMBIENT DEMO'
      : 'INDEPENDENT CREATOR EPISODE';
    $('#focus-art').src = artwork(episode.artwork);
    $('#focus-art').alt = `${episode.show} artwork`;
    $('#focus-heading').textContent = episode.title;
    $('#focus-heading').lang = episode.language;
    $('#focus-show').textContent = `${episode.show} · ${episode.host}`;
    $('#focus-description').textContent = episode.description;
    $('#focus-description').lang = episode.demo ? 'en' : episode.language;
    $('#focus-language').textContent =
      `${{ kn: 'ಕನ್ನಡ · KANNADA', hi: 'हिन्दी · HINDI', en: 'ENGLISH' }[episode.language] || 'EPISODE'} / ${episode.category.toUpperCase()}`;
    $('#focus-demo').hidden = !episode.demo;
    ['player-save', 'skip-back', 'skip-forward', 'player-seek', 'focus-seek'].forEach((id) => {
      $(`#${id}`).disabled = false;
    });
    this.updateSaved();
  }

  updateSaved() {
    const saved = this.current && store.state.saved.includes(this.current.id);
    const label = saved ? 'Remove current episode from library' : 'Save current episode';
    [$('#player-save'), $('[data-player="save"]')].forEach((button) => {
      button.classList.toggle('is-saved', !!saved);
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(!!saved));
    });
  }

  updatePlayback() {
    const playing = !this.audio.paused && !this.audio.ended;
    [$('#play-toggle'), $('.focus-play')].forEach((button) => {
      button.innerHTML = icon(playing ? 'pause' : 'play');
      button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    });
    document.body.dataset.playing = String(playing);
    window.dispatchEvent(
      new CustomEvent('audiora:playback', { detail: { episode: this.current, playing } }),
    );
  }

  updateTime() {
    const duration = Number.isFinite(this.audio.duration)
      ? this.audio.duration
      : this.current?.duration || 0;
    const position = this.audio.currentTime || 0;
    ['player-seek', 'focus-seek'].forEach((id) => {
      const input = $(`#${id}`);
      input.max = duration || 1;
      input.value = position;
      input.setAttribute('aria-valuetext', `${time(position)} of ${time(duration)}`);
      rangeFill(input);
    });
    $('#current-time').textContent = $('#focus-time').textContent = time(position);
    $('#duration-time').textContent = $('#focus-duration').textContent = time(duration);
  }

  updatePreferences() {
    $('#player-volume').value = this.audio.volume;
    $('#player-volume').setAttribute(
      'aria-valuetext',
      `${Math.round(this.audio.volume * 100)} percent`,
    );
    rangeFill($('#player-volume'));
    $('#volume-toggle').innerHTML = icon(this.audio.volume === 0 ? 'mute' : 'volume');
    $('#volume-toggle').setAttribute('aria-label', this.audio.volume === 0 ? 'Unmute' : 'Mute');
    $('#speed-button').textContent = `${this.audio.playbackRate}×`;
    $('#speed-button').setAttribute(
      'aria-label',
      `Playback speed: ${this.audio.playbackRate} times. Change speed`,
    );
  }
  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, value));
    if (value > 0) this.lastVolume = value;
    store.set('volume', this.audio.volume, false);
    this.updatePreferences();
  }
  toggleMute() {
    this.setVolume(this.audio.volume === 0 ? this.lastVolume : 0);
  }
  cycleRate() {
    const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
    this.audio.playbackRate = rates[(rates.indexOf(this.audio.playbackRate) + 1) % rates.length];
    this.audio.defaultPlaybackRate = this.audio.playbackRate;
    store.set('rate', this.audio.playbackRate, false);
    this.updatePreferences();
    toast(`Listening at ${this.audio.playbackRate}× speed.`);
  }
  openFocus() {
    if (!this.current) {
      toast('Choose an episode first to find your focus.');
      return;
    }
    openDialog($('#focus-dialog'));
    $('.focus-play').focus();
  }

  updateQueue() {
    const queue = store.state.queue.map((id) => this.getEpisode(id)).filter(Boolean);
    $('#queue-count').textContent = queue.length;
    $('#queue-count').hidden = !queue.length;
    $('#player-next').disabled = !queue.length;
    $('#queue-clear').disabled = !queue.length;
    $('#queue-summary').textContent =
      `${queue.length} ${queue.length === 1 ? 'episode' : 'episodes'} waiting`;
    $('#queue-current').innerHTML = this.current
      ? `<p class="queue-label">ON YOUR PLAYER</p><div class="queue-now"><img src="${artwork(this.current.artwork)}" alt=""><div><strong>${esc(this.current.title)}</strong><span>${esc(this.current.show)}</span></div><span class="queue-playing">${icon('headphones')}</span></div>`
      : '';
    $('#queue-list').innerHTML = queue.length
      ? `<p class="queue-label">UP NEXT</p>${queue.map((episode, index) => `<div class="queue-item"><span class="queue-index">${index + 1}</span><button class="queue-episode" data-queue-play="${esc(episode.id)}" aria-label="Play ${esc(episode.title)}"><img src="${artwork(episode.artwork)}" alt=""><span><strong>${esc(episode.title)}</strong><small>${esc(episode.show)} · ${time(episode.duration)}</small></span></button><button class="icon-button" data-queue-remove="${esc(episode.id)}" aria-label="Remove ${esc(episode.title)} from queue">${icon('close')}</button></div>`).join('')}`
      : `<div class="queue-empty">${icon('queue')}<h3>Leave room for a little more.</h3><p>Add episodes with the + Queue button.<br>Your next listen will play automatically.</p></div>`;
  }

  setSleep(value) {
    clearInterval(this.sleepInterval);
    this.sleepAt = value && value !== 'end' ? Date.now() + Number(value) * 60000 : null;
    this.sleepAtEnd = value === 'end';
    if (this.sleepAt) this.sleepInterval = setInterval(() => this.checkSleep(), 1000);
    this.updateSleep();
    toast(
      value
        ? value === 'end'
          ? 'We’ll pause at the end of this episode.'
          : `Sleep timer set for ${value} minutes.`
        : 'Sleep timer turned off.',
    );
  }
  checkSleep() {
    if (this.sleepAt && Date.now() >= this.sleepAt) {
      this.audio.pause();
      clearInterval(this.sleepInterval);
      this.sleepAt = null;
      toast('Your sleep timer ended. Rest easy.');
    }
    this.updateSleep();
  }
  updateSleep() {
    const active = !!(this.sleepAt || this.sleepAtEnd);
    $('#sleep-open').classList.toggle('timer-active', active);
    $('#sleep-open').setAttribute(
      'aria-label',
      active ? 'Sleep timer active. Change timer' : 'Set sleep timer',
    );
    $('#sleep-status').textContent = this.sleepAt
      ? `Audio pauses in ${time(Math.ceil((this.sleepAt - Date.now()) / 1000))}.`
      : this.sleepAtEnd
        ? 'Audio will pause at the end of this episode.'
        : 'No sleep timer set.';
    $('#sleep-cancel').hidden = !active;
  }
}
