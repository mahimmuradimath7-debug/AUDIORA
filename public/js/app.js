import {
  $,
  $$,
  api,
  artwork,
  escapeHtml as esc,
  durationLabel,
  languageLabel,
  time,
  toast,
  openDialog,
  setupDialog,
} from './utils.js';
import { icon, hydrateIcons } from './icons.js';
import { store } from './store.js';
import { Player } from './player.js';
import { Studio } from './studio.js';

hydrateIcons();
const state = {
  episodes: [],
  view: 'discover',
  language: store.state.language,
  category: 'all',
  mood: 'all',
  query: '',
  limit: 8,
  loading: true,
  error: null,
};
const findEpisode = (id) => state.episodes.find((episode) => episode.id === id);
const player = new Player(findEpisode, () => state.episodes);
const studio = new Studio((episode) => {
  state.episodes.unshift(episode);
  state.view = 'discover';
  resetFilters();
  render();
}, loadConfig);

function normalize(value) {
  return String(value).normalize('NFKC').toLowerCase();
}
function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

function curate(episodes) {
  // Give all three languages a place on the first shelf, keeping the editor's pick first.
  const featured = episodes.filter((episode) => episode.featured);
  const remaining = episodes.filter((episode) => !episode.featured);
  const languages = ['kn', 'hi', 'en'].map((language) =>
    remaining.filter((episode) => episode.language === language),
  );
  const ordered = [...featured];
  while (languages.some((group) => group.length))
    languages.forEach((group) => {
      if (group.length) ordered.push(group.shift());
    });
  return ordered;
}

function filteredEpisodes() {
  let episodes = [...state.episodes];
  if (state.view === 'library')
    episodes = episodes.filter((episode) => store.state.saved.includes(episode.id));
  if (state.view === 'history')
    episodes = episodes
      .filter((episode) => store.state.progress[episode.id])
      .sort((a, b) => store.state.progress[b.id].updatedAt - store.state.progress[a.id].updatedAt);
  const terms = normalize(state.query.trim()).split(/\s+/u).filter(Boolean);
  return episodes.filter((episode) => {
    if (state.language !== 'all' && episode.language !== state.language) return false;
    if (state.category !== 'all' && episode.category !== state.category) return false;
    if (state.mood !== 'all' && episode.mood !== state.mood) return false;
    const text = normalize(
      [episode.title, episode.show, episode.host, episode.description].join(' '),
    );
    return terms.every((term) => text.includes(term));
  });
}

function episodeCard(episode) {
  const saved = store.state.saved.includes(episode.id);
  const queued = store.state.queue.includes(episode.id);
  const current = player.current?.id === episode.id;
  const playing = current && !player.audio.paused;
  const progress = store.state.progress[episode.id];
  return `
    <article class="episode-card${current ? ' is-current' : ''}" data-episode="${esc(episode.id)}">
      <div class="cover-wrap">
        <button class="cover-play" data-play="${esc(episode.id)}" aria-label="${playing ? 'Pause' : 'Play'} ${esc(episode.title)}">
          <img class="episode-cover" src="${artwork(episode.artwork)}" alt="" loading="lazy" width="600" height="600">
          <span class="cover-title"><small>${esc(episode.category)} / ${episode.demo ? 'AUDIORA DEMO' : 'CREATOR EPISODE'}</small>${esc(episode.show)}</span>
          <span class="cover-play-circle">${icon(playing ? 'pause' : 'play')}</span>
        </button>
        <div class="cover-top"><span class="cover-language" lang="${esc(episode.language)}">${languageLabel(episode.language)}</span></div>
        <button class="icon-button cover-save${saved ? ' is-saved' : ''}" data-save="${esc(episode.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Save'} ${esc(episode.title)}${saved ? ' from library' : ' to library'}">${icon('bookmark')}</button>
        ${progress ? `<span class="card-progress" style="width:${Math.min(100, Math.max(0, (progress.position / (progress.duration || 1)) * 100))}%"></span>` : ''}
      </div>
      <div class="episode-meta"><span class="category">${esc(episode.category)}</span><span>·</span><span>${durationLabel(episode.duration)}</span>${episode.featured ? '<span>·</span><span>Editor’s pick</span>' : ''}</div>
      <button class="episode-title" lang="${esc(episode.language)}" data-details="${esc(episode.id)}" aria-label="Read about ${esc(episode.title)}">${esc(episode.title)}</button>
      <p class="episode-host">${esc(episode.show)} <span>with ${esc(episode.host)}</span></p>
      <div class="episode-bottom">
        <span class="demo-label">${episode.demo ? 'AMBIENT DEMO' : 'CREATOR EPISODE'}</span>
        <button class="queue-add${queued ? ' queued' : ''}" data-queue="${esc(episode.id)}" aria-label="${queued ? 'Already queued:' : 'Add to queue:'} ${esc(episode.title)}">${icon(queued ? 'check' : 'plus')} ${queued ? 'Queued' : 'Queue'}</button>
      </div>
    </article>`;
}

function render() {
  const isDiscover = state.view === 'discover';
  const filtered =
    state.language !== 'all' || state.category !== 'all' || state.mood !== 'all' || !!state.query;
  $('#discover-hero').hidden = !isDiscover || !!state.query;
  $('#mood-section').hidden = !isDiscover || !!state.query;
  $$('.nav-link, .mobile-nav [data-view]').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('.language-pill').forEach((button) => {
    const active = button.dataset.language === state.language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('#category-tabs button').forEach((button) => {
    const active = button.dataset.category === state.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#reset-filters').hidden = !filtered;
  $('#search-clear').hidden = !state.query;
  $('.search kbd').hidden = !!state.query;
  $('#saved-count').textContent = store.state.saved.length;
  const title = state.query
    ? 'A little closer to your next listen.'
    : state.view === 'library'
      ? 'Good listens, kept close.'
      : state.view === 'history'
        ? 'A trail of good stories.'
        : 'Your next good listen';
  $('#catalogue-heading').textContent = title;
  if (!state.query && isDiscover)
    $('#catalogue-heading').insertAdjacentHTML('beforeend', '<span class="violet-period">.</span>');
  $('#catalogue-eyebrow').textContent = state.query
    ? 'FOLLOW YOUR CURIOSITY'
    : state.view === 'library'
      ? 'YOUR SAVED COLLECTION'
      : state.view === 'history'
        ? 'RECENTLY PLAYED'
        : 'GOOD LISTENING STARTS HERE';
  $('#view-description').hidden = isDiscover;
  $('#view-description').textContent =
    state.view === 'library'
      ? 'All the listens you’ve bookmarked. Saved in this browser, just for you.'
      : 'Pick up where you left off, or hear something again. Your history stays on this device.';
  $('#active-mood').hidden = state.mood === 'all';
  $('#active-mood').innerHTML =
    state.mood !== 'all'
      ? `${icon('headphones')} In the mood for: ${esc(state.mood)} <button id="remove-mood" aria-label="Clear mood filter">${icon('close')}</button>`
      : '';
  $('#episode-grid').setAttribute('aria-busy', String(state.loading));
  $('#catalogue-status').innerHTML = '';
  $('#show-more')?.remove();
  if (state.loading) {
    $('#result-count').textContent = 'Finding good things to listen to…';
    $('#episode-grid').innerHTML = Array.from(
      { length: 4 },
      () =>
        '<div class="skeleton" aria-hidden="true"><div class="skeleton-cover"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>',
    ).join('');
  } else if (state.error) {
    $('#result-count').textContent = '';
    $('#episode-grid').innerHTML = '';
    $('#catalogue-status').innerHTML =
      `<div class="empty-state">${icon('info')}<h3>A little quiet on the line.</h3><p>${esc(state.error)}</p><button class="button button-dark" id="retry-catalogue">${icon('refresh')} Try again</button></div>`;
  } else {
    const episodes = filteredEpisodes();
    $('#result-count').textContent =
      `${episodes.length} ${episodes.length === 1 ? 'listen' : 'listens'}${state.query ? ` for “${state.query}”` : ' to make time for'}`;
    $('#episode-grid').innerHTML = episodes.slice(0, state.limit).map(episodeCard).join('');
    if (!episodes.length) {
      const emptyCollection = !filtered && state.view !== 'discover';
      const title = emptyCollection
        ? state.view === 'library'
          ? 'Keep a little inspiration close.'
          : 'Your listening story starts here.'
        : 'A different frequency, perhaps?';
      const description = emptyCollection
        ? state.view === 'library'
          ? 'Tap the bookmark on any episode to save it here. Your next good listen will be waiting.'
          : 'Play an episode and your listening history will find a home here.'
        : 'No episodes match just yet. Try another word, language, category, or mood.';
      $('#catalogue-status').innerHTML =
        `<div class="empty-state">${icon(emptyCollection ? 'bookmark' : 'search')}<h3>${title}</h3><p>${description}</p><button class="button button-dark" ${emptyCollection ? 'data-view="discover"' : 'id="empty-reset"'}>${emptyCollection ? 'Explore the collection' : 'Clear filters'} ${icon('arrow-right')}</button></div>`;
    }
    if (episodes.length > state.limit)
      $('#episode-grid').insertAdjacentHTML(
        'afterend',
        `<button id="show-more" class="show-more">A little more to discover <span>Explore all ${episodes.length} episodes</span>${icon('arrow-right')}</button>`,
      );
  }
  renderContinue();
}

function renderContinue() {
  const recent = state.episodes
    .filter((episode) => {
      const progress = store.state.progress[episode.id];
      return (
        progress &&
        !progress.completed &&
        progress.position > 0 &&
        progress.duration > progress.position + 0.6
      );
    })
    .sort((a, b) => store.state.progress[b.id].updatedAt - store.state.progress[a.id].updatedAt)
    .slice(0, 3);
  $('#continue-section').hidden = state.view !== 'discover' || !recent.length || !!state.query;
  $('#continue-grid').innerHTML = recent
    .map((episode) => {
      const progress = store.state.progress[episode.id];
      return `<article class="continue-card"><img src="${artwork(episode.artwork)}" alt="" width="61" height="61"><div class="continue-info"><strong>${esc(episode.title)}</strong><small>${time(progress.duration - progress.position)} left · ${languageLabel(episode.language)}</small><div class="continue-progress"><span style="width:${Math.min(100, (progress.position / progress.duration) * 100)}%"></span></div></div><button class="icon-button" data-resume="${esc(episode.id)}" aria-label="Continue ${esc(episode.title)}">${icon('play')}</button></article>`;
    })
    .join('');
}

function resetFilters() {
  clearTimeout(searchTimer);
  state.language = 'all';
  state.category = 'all';
  state.mood = 'all';
  state.query = '';
  state.limit = 8;
  $('#search-input').value = '';
  store.set('language', 'all', false);
}

function changeView(view) {
  state.view = view;
  resetFilters();
  render();
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

async function loadCatalogue() {
  state.loading = true;
  state.error = null;
  render();
  $('#hero-play').disabled = true;
  $('#play-toggle').disabled = !player.current;
  $('#player-shuffle').disabled = !state.episodes.length;
  try {
    const response = await api('/api/episodes');
    if (!Array.isArray(response.episodes))
      throw new Error('The collection is unavailable right now. Please try again.');
    state.episodes = curate(response.episodes);
    if (!player.current) player.restore();
    player.updateQueue();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    $('#hero-play').disabled = !state.episodes.length;
    $('#play-toggle').disabled = !player.current;
    $('#player-shuffle').disabled = !state.episodes.length;
    render();
  }
}

async function loadConfig() {
  studio.setConfig(null);
  try {
    studio.setConfig(await api('/api/config'));
  } catch (error) {
    studio.setConfig(null, error.message);
  }
}

$('#dialog-root').insertAdjacentHTML(
  'beforeend',
  `
  <dialog id="about-dialog" class="small-dialog about-dialog" aria-labelledby="about-heading"><div class="dialog-heading"><div><p class="eyebrow">GOOD STORIES. YOUR PACE.</p><h2 id="about-heading">A place to tune in.</h2></div><button class="icon-button" data-close-dialog aria-label="Close about this collection">${icon('close')}</button></div><p>Audiora is an original podcast web app with a fictional editorial catalogue. The Kannada, Hindi, and English episode concepts are created for this demonstration.</p><div class="about-note">${icon('headphones')}<p>Every seeded episode uses the same original 30-second ambient audio clip. These are previews of the listening experience, not recordings of speech in the selected language.</p></div><p>The interface is in English, with native-script titles and language labels. Creator Studio lets your server’s administrator publish real MP3 recordings.</p><h3>Your listening, kept local.</h3><p>Saved episodes, queue, volume, speed, and progress stay in this browser’s local storage. There are no accounts, trackers, or cloud sync. Clearing browser data removes this history. Private browsing or storage restrictions may limit persistence.</p><p class="about-signoff">Find your frequency. Make a little room.</p><p class="about-developer">made with love by <a href="https://instagram.com/mahim_photopedia_" target="_blank" rel="noopener noreferrer">@mahim_photopedia_</a></p></dialog>
  <dialog id="shortcuts-dialog" class="small-dialog" aria-labelledby="shortcuts-heading"><div class="dialog-heading"><div><p class="eyebrow">LESS CLICKING, MORE LISTENING</p><h2 id="shortcuts-heading">At your fingertips.</h2></div><button class="icon-button" data-close-dialog aria-label="Close keyboard shortcuts">${icon('close')}</button></div><dl class="shortcut-list"><div><dt>Play / pause</dt><dd><kbd>Space</kbd> or <kbd>K</kbd></dd></div><div><dt>Back / forward 15 seconds</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd></div><div><dt>Mute / unmute</dt><dd><kbd>M</kbd></dd></div><div><dt>Search the collection</dt><dd><kbd>/</kbd></dd></div><div><dt>Open this guide</dt><dd><kbd>?</kbd></dd></div><div><dt>Close a listening dialog</dt><dd><kbd>Esc</kbd></dd></div></dl><p class="dialog-intro">Shortcuts take a break while you’re typing or filling out a form. Focused buttons and sliders keep their normal keyboard controls.</p></dialog>
  <dialog id="episode-dialog" class="episode-dialog" aria-labelledby="episode-detail-heading"><button class="icon-button detail-close" data-close-dialog aria-label="Close episode details">${icon('close')}</button><div id="episode-detail-content"></div></dialog>`,
);
['about', 'shortcuts', 'episode'].forEach((name) => setupDialog($(`#${name}-dialog`)));

function showDetails(episode) {
  if (!episode) return;
  const saved = store.state.saved.includes(episode.id);
  $('#episode-detail-content').innerHTML = `
    <img class="detail-cover" src="${artwork(episode.artwork)}" alt="${esc(episode.show)} artwork">
    <div class="detail-copy">
      <p class="eyebrow">${languageLabel(episode.language)} · ${esc(episode.category)} · ${durationLabel(episode.duration)}</p>
      <h2 id="episode-detail-heading" lang="${esc(episode.language)}">${esc(episode.title)}</h2>
      <p class="detail-show">${esc(episode.show)} with ${esc(episode.host)}</p>
      <p class="detail-description" lang="${episode.demo ? 'en' : esc(episode.language)}">${esc(episode.description)}</p>
      ${episode.demo ? '<p class="demo-notice">Original 30-second ambient demo. No spoken-language recording is included.</p>' : '<p class="demo-notice">Independent creator recording.</p>'}
      <div class="detail-actions">
        <button class="button button-violet" data-play="${esc(episode.id)}">${icon('play')} Listen now</button>
        <button class="icon-button${saved ? ' is-saved' : ''}" data-save="${esc(episode.id)}" aria-label="${saved ? 'Remove from' : 'Save to'} library" aria-pressed="${saved}">${icon('bookmark')}</button>
        <button class="icon-button" data-queue="${esc(episode.id)}" aria-label="Add episode to queue">${icon('queue')}</button>
      </div>
    </div>`;
  openDialog($('#episode-dialog'));
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) changeView(button.dataset.view);
  if (button.dataset.language) {
    state.language = button.dataset.language;
    state.limit = 8;
    store.set('language', state.language, false);
    render();
  }
  if (button.dataset.category) {
    state.category = button.dataset.category;
    state.limit = 8;
    render();
  }
  if (button.dataset.mood) {
    state.view = 'discover';
    state.mood = button.dataset.mood;
    state.limit = 8;
    render();
    $('.catalogue-section').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
  if (button.dataset.play) {
    player.select(findEpisode(button.dataset.play));
    if (button.closest('#episode-dialog')) $('#episode-dialog').close();
  }
  if (button.dataset.resume) {
    const episode = findEpisode(button.dataset.resume);
    if (player.current?.id === episode.id) player.play();
    else player.select(episode);
  }
  if (button.dataset.save) {
    const id = button.dataset.save;
    const saved = store.toggleSaved(id);
    toast(saved ? 'Saved to your library on this device.' : 'Removed from your library.');
    const replacement = $$('[data-save]').find(
      (item) => item.dataset.save === id && item.closest('dialog') === button.closest('dialog'),
    );
    if (!button.isConnected)
      (replacement || $('#episode-grid .cover-play') || $('#catalogue-status button'))?.focus({
        preventScroll: true,
      });
  }
  if (button.dataset.queue) player.enqueue(button.dataset.queue);
  if (button.dataset.details) showDetails(findEpisode(button.dataset.details));
  if (['reset-filters', 'empty-reset'].includes(button.id)) {
    resetFilters();
    render();
  }
  if (button.id === 'remove-mood') {
    state.mood = 'all';
    render();
  }
  if (button.id === 'retry-catalogue') loadCatalogue();
  if (button.id === 'show-more') {
    const previousLimit = state.limit;
    state.limit = state.episodes.length;
    render();
    $$('.episode-card .cover-play')[previousLimit]?.focus({ preventScroll: true });
  }
});

$('#search-input').maxLength = 256;
let searchTimer;
$('#search-input').addEventListener('input', (event) => {
  const value = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = value;
    state.limit = 8;
    render();
  }, 160);
});
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  state.query = $('#search-input').value;
  state.limit = 8;
  render();
  $('.catalogue-section').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
});
$('#search-clear').addEventListener('click', () => {
  clearTimeout(searchTimer);
  state.query = '';
  $('#search-input').value = '';
  render();
  $('#search-input').focus();
});
$('#hero-play').addEventListener('click', () => player.random());
$('#history-link').addEventListener('click', () => changeView('history'));
$('#about-open').addEventListener('click', () => openDialog($('#about-dialog')));
$('#shortcuts-open').addEventListener('click', () => openDialog($('#shortcuts-dialog')));

window.addEventListener('audiora:store', (event) => {
  if (['saved', 'queue'].includes(event.detail.key)) {
    if (event.detail.key === 'saved' && state.view === 'library') render();
    {
      $('#saved-count').textContent = store.state.saved.length;
      $$('[data-save]').forEach((button) => {
        const saved = store.state.saved.includes(button.dataset.save);
        button.classList.toggle('is-saved', saved);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute(
          'aria-label',
          `${saved ? 'Remove' : 'Save'} ${findEpisode(button.dataset.save)?.title || 'episode'} ${saved ? 'from' : 'to'} library`,
        );
      });
      $$('.queue-add').forEach((button) => {
        const queued = store.state.queue.includes(button.dataset.queue);
        button.classList.toggle('queued', queued);
        button.innerHTML = `${icon(queued ? 'check' : 'plus')} ${queued ? 'Queued' : 'Queue'}`;
        button.setAttribute(
          'aria-label',
          `${queued ? 'Already queued:' : 'Add to queue:'} ${findEpisode(button.dataset.queue)?.title || 'episode'}`,
        );
      });
    }
  }
});
window.addEventListener('audiora:progress', () => {
  renderContinue();
  if (state.view === 'history') render();
});
window.addEventListener('audiora:playback', (event) => {
  const { episode, playing } = event.detail;
  $$('.episode-card').forEach((card) => {
    const current = card.dataset.episode === episode?.id;
    card.classList.toggle('is-current', current);
    $('.cover-play-circle', card).innerHTML = icon(current && playing ? 'pause' : 'play');
    $('.cover-play', card).setAttribute(
      'aria-label',
      `${current && playing ? 'Pause' : 'Play'} ${findEpisode(card.dataset.episode)?.title || 'episode'}`,
    );
  });
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
  if (
    event.target.isContentEditable ||
    event.target.closest('input,textarea,select,[role="textbox"]')
  )
    return;
  const dialog = $('dialog[open]');
  if (dialog && dialog.id !== 'focus-dialog') return;
  const interactive = event.target.closest('button,a,summary');
  const key = event.key.toLowerCase();
  if ((key === ' ' || key.startsWith('arrow')) && interactive) return;
  if (key === ' ' || key === 'k') {
    event.preventDefault();
    player.toggle();
  }
  if (key === 'm') {
    event.preventDefault();
    player.toggleMute();
  }
  if (key === 'arrowleft') {
    event.preventDefault();
    player.seekBy(-15);
  }
  if (key === 'arrowright') {
    event.preventDefault();
    player.seekBy(15);
  }
  if (key === '/' && !dialog) {
    event.preventDefault();
    $('#search-input').focus();
  }
  if (key === '?' && !dialog) {
    event.preventDefault();
    openDialog($('#shortcuts-dialog'));
  }
});

loadCatalogue();
loadConfig();
if (!store.available)
  toast('Browser storage is unavailable. Your listening will stay in this tab for this visit.');
