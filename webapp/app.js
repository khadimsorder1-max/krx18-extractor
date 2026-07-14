/* KRX18 Premium Mini App — JavaScript */
(function () {
  'use strict';

  const API = { latest: '/api/latest', movie: '/api/movie', search: '/api/search' };
  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'eng-sub', label: 'Eng-Sub' },
    { id: 'uncensored', label: 'Uncensored' },
    { id: 'censored', label: 'Censored' },
    { id: 'hd', label: 'HD' },
    { id: 'korea', label: 'Korea' },
  ];

  const state = {
    view: 'latest', page: 1, filter: 'all', searchQuery: '',
    items: [], isLoading: false, hasMore: true,
    heroItem: null, currentMovieSlug: null,
    tg: null, tgUser: null,
    settings: { haptics: true, lowData: false },
    pollInterval: null, pollCount: 0
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const dom = {};

  function cacheDom() {
    dom.splash = $('#splash');
    dom.grid = $('#grid'); dom.skeletonGrid = $('#skeletonGrid');
    dom.loadMore = $('#loadMore'); dom.loadMoreBtn = $('#loadMoreBtn');
    dom.empty = $('#empty'); dom.sectionTitle = $('#sectionTitle');
    dom.sectionCount = $('#sectionCount');
    dom.searchForm = $('#searchForm'); dom.searchInput = $('#searchInput'); dom.searchClear = $('#searchClear');
    dom.settingsBtn = $('#settingsBtn'); dom.filtersScroll = $('#filtersScroll');
    dom.hero = $('#hero'); dom.heroBackdrop = $('#heroBackdrop'); dom.heroTitle = $('#heroTitle');
    dom.heroMeta = $('#heroMeta'); dom.heroStory = $('#heroStory');
    dom.heroPlay = $('#heroPlay'); dom.heroDetails = $('#heroDetails');
    dom.modal = $('#modal'); dom.modalBody = $('#modalBody');
    dom.sheet = $('#sheet'); dom.sheetTitle = $('#sheetTitle'); dom.sheetHint = $('#sheetHint');
    dom.sheetGrid = $('#sheetGrid'); dom.sheetUrl = $('#sheetUrl'); dom.sheetCopy = $('#sheetCopy'); dom.sheetTip = $('#sheetTip');
    dom.settingsSheet = $('#settingsSheet'); dom.settingsList = $('#settingsList');
    dom.toast = $('#toast');
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toast = (msg, type = '') => {
    dom.toast.textContent = msg; dom.toast.className = 'toast toast--' + type; dom.toast.hidden = false;
    requestAnimationFrame(() => dom.toast.classList.add('is-visible'));
    clearTimeout(toast._t); toast._t = setTimeout(() => { dom.toast.classList.remove('is-visible'); setTimeout(() => (dom.toast.hidden = true), 250); }, 2400);
  };
  const fetchJson = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const ls = { get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) { hideSplash(); return; }
    state.tg = tg;
    tg.ready(); tg.expand();
    if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
    if (tg.colorScheme === 'light') document.documentElement.classList.add('light');
    tg.onEvent('themeChanged', () => { document.documentElement.classList.toggle('light', tg.colorScheme === 'light'); });
    if (tg.initDataUnsafe?.user) state.tgUser = tg.initDataUnsafe.user;
    tg.onEvent('backButtonClicked', () => {
      if (!dom.sheet.hidden) closeSheet();
      else if (!dom.settingsSheet.hidden) closeSettings();
      else if (!dom.modal.hidden) closeModal();
      else if (state.view !== 'latest') switchView('latest');
      else if (tg.exit) tg.exit();
    });
    hideSplash();
  }

  function hideSplash() { if (dom.splash) { dom.splash.classList.add('is-hidden'); setTimeout(() => { if (dom.splash) dom.splash.style.display = 'none'; }, 400); } }
  function haptic(type = 'light') {
    if (!state.settings.haptics || !state.tg?.HapticFeedback) return;
    try {
      if (['success', 'error', 'warning'].includes(type)) state.tg.HapticFeedback.notificationOccurred(type);
      else state.tg.HapticFeedback.impactOccurred(type);
    } catch {}
  }
  function showBackButton(show) { if (!state.tg?.BackButton) return; if (show) state.tg.BackButton.show(); else state.tg.BackButton.hide(); }

  function qualityBadge(q) {
    if (!q) return '';
    const s = String(q).toLowerCase();
    if (/4k|2160p|uhd/.test(s)) return '<span class="badge badge--4k">4K</span>';
    if (/1080p|1080|full\s*hd/.test(s)) return '<span class="badge badge--1080p">1080P</span>';
    if (/720p|720|hd-/.test(s)) return '<span class="badge badge--720p">720P</span>';
    if (/480p|480/.test(s)) return '<span class="badge badge--480p">480P</span>';
    if (/eng/i.test(s)) return '<span class="badge badge--eng-sub">ENG</span>';
    if (/hd/i.test(s)) return '<span class="badge badge--hd">HD</span>';
    return '';
  }
  function censoredBadge(title) {
    const s = String(title || '').toLowerCase();
    if (s.includes('uncensored')) return '<span class="badge badge--uncensored">Uncensored</span>';
    if (s.includes('censored')) return '<span class="badge badge--censored">Censored</span>';
    return '';
  }
  function buildBadges(m) {
    const parts = [];
    const qb = qualityBadge(m.quality); if (qb) parts.push(qb);
    const cb = censoredBadge(m.title); if (cb) parts.push(cb);
    return parts.slice(0, 4).join('');
  }
  function prettyTitle(title) {
    return String(title || '')
      .replace(/&#038;/g, '&')
      .replace(/&#8211;|&#8212;|&#8217;|&#8220;|&#8221;|&#8230;/g, (c) => ({ '&#038;': '&', '&#8211;': '–', '&#8212;': '—', '&#8217;': "'", '&#8220;': '"', '&#8221;': '"', '&#8230;': '…' })[c])
      .trim();
  }

  function renderFilters() {
    dom.filtersScroll.innerHTML = FILTERS.map((f) => `<button class="pill ${f.id === state.filter ? 'is-active' : ''}" data-filter="${f.id}">${escapeHtml(f.label)}</button>`).join('');
  }
  function setFilter(filterId) {
    if (state.filter === filterId && state.view === 'latest') return;
    haptic('selection');
    state.filter = filterId; state.view = 'latest'; state.page = 1; state.items = []; state.hasMore = true;
    renderFilters(); updateSectionHead(); loadList();
  }

  function showSkeletons(n = 10) {
    dom.skeletonGrid.innerHTML = Array.from({ length: n }).map(() => `<div class="skeleton"><div class="skeleton__poster"></div><div class="skeleton__line"></div><div class="skeleton__line"></div></div>`).join('');
    dom.skeletonGrid.hidden = false; dom.grid.hidden = true; dom.loadMore.hidden = true; dom.empty.hidden = true;
  }
  function hideSkeletons() { dom.skeletonGrid.hidden = true; dom.grid.hidden = false; }

  function cardHtml(m) {
    const title = prettyTitle(m.title);
    const poster = m.poster || '';
    const badges = buildBadges(m);
    return `<article class="card" role="button" tabindex="0" data-slug="${escapeHtml(m.slug)}" aria-label="${escapeHtml(title)}">
      <div class="card__poster">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)} poster" loading="lazy" decoding="async" onerror="this.style.display='none'">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:11px;text-align:center;padding:8px">${escapeHtml(title)}</div>`}
        <div class="card__badges">${badges}</div>
        <div class="card__overlay"><span class="card__play"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></div>
      </div>
      <div class="card__body"><div class="card__title">${escapeHtml(title)}</div><div class="card__meta">${m.year ? `<span>${escapeHtml(m.year)}</span>` : ''}${m.releaseDate ? `<span class="dot">•</span><span>${escapeHtml(m.releaseDate)}</span>` : ''}</div></div>
    </article>`;
  }
  function renderGrid() {
    if (state.items.length === 0) { dom.grid.innerHTML = ''; dom.empty.hidden = state.isLoading ? true : false; return; }
    dom.grid.innerHTML = state.items.map(cardHtml).join('');
    dom.empty.hidden = true;
    dom.loadMore.hidden = !state.hasMore || state.items.length < 6;
  }
  function appendGrid(items) { dom.grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join('')); }

  async function loadList({ append = false } = {}) {
    if (state.isLoading) return;
    state.isLoading = true;
    if (!append) showSkeletons();
    dom.loadMoreBtn && (dom.loadMoreBtn.disabled = true);
    dom.loadMoreBtn && (dom.loadMoreBtn.textContent = 'Loading…');
    try {
      let items = [];
      if (state.view === 'search') {
        if (!state.searchQuery) { state.isLoading = false; hideSkeletons(); dom.empty.hidden = false; return; }
        const r = await fetchJson(`${API.search}?q=${encodeURIComponent(state.searchQuery)}&page=${state.page}`);
        items = r.items || []; state.hasMore = !!r.hasMore;
      } else {
        const params = new URLSearchParams({ page: String(state.page) });
        if (state.filter !== 'all') params.set('filter', state.filter);
        const r = await fetchJson(`${API.latest}?${params}`);
        items = r.items || []; state.hasMore = !!r.hasMore;
        if (state.page === 1 && items.length > 0 && state.filter === 'all') setHero(items[0]);
        else if (state.filter !== 'all') dom.hero.hidden = true;
      }
      if (append) { state.items = state.items.concat(items); appendGrid(items); }
      else { state.items = items; hideSkeletons(); renderGrid(); }
      if (state.items.length === 0) { dom.empty.hidden = false; dom.grid.innerHTML = ''; }
    } catch (e) { console.error(e); toast('Failed to load. Retry.', 'error'); haptic('error'); if (!append) dom.empty.hidden = false; }
    finally { state.isLoading = false; dom.loadMoreBtn && (dom.loadMoreBtn.disabled = false); dom.loadMoreBtn && (dom.loadMoreBtn.textContent = 'Load more'); }
  }

  function setHero(item) {
    if (!item) { dom.hero.hidden = true; return; }
    state.heroItem = item;
    const title = prettyTitle(item.title);
    dom.heroTitle.textContent = title;
    dom.heroMeta.innerHTML = [item.year ? `<span>${escapeHtml(item.year)}</span>` : '', item.quality ? `<span class="dot">•</span><span>${escapeHtml(item.quality)}</span>` : '', item.releaseDate ? `<span class="dot">•</span><span>${escapeHtml(item.releaseDate)}</span>` : ''].join(' ');
    dom.heroStory.textContent = item.synopsis || '';
    dom.heroBackdrop.style.backgroundImage = item.poster ? `url('${escapeHtml(item.poster)}')` : '';
    dom.hero.hidden = false;
  }

  async function openMovie(slug) {
    haptic('light');
    state.currentMovieSlug = slug;
    dom.modal.hidden = false; dom.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    showBackButton(true);
    dom.modalBody.innerHTML = '<div class="skeleton-modal"></div>';
    try {
      const r = await fetchJson(`${API.movie}?slug=${encodeURIComponent(slug)}`);
      renderMovieModal(r);
    } catch (e) { dom.modalBody.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Failed to load.</div>`; }
  }

  function renderMovieModal(m) {
    const title = prettyTitle(m.title);
    const downloads = m.downloads || [];
    const favs = ls.get('krx18.favs', []);
    const isFav = favs.some((f) => f.slug === m.slug);
    dom.modalBody.innerHTML = `
      <div class="modal__hero" ${m.poster ? `style="background-image:url('${escapeHtml(m.poster)}')"` : ''}>
        <div class="modal__hero-content">
          <div class="modal__poster">${m.poster ? `<img src="${escapeHtml(m.poster)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">` : ''}</div>
          <div class="modal__head">
            <h2 class="modal__title">${escapeHtml(title)}</h2>
            <div class="modal__meta">${m.country ? `<span>${escapeHtml(m.country)}</span>` : ''}${m.quality ? `<span class="dot">•</span><span>${escapeHtml(m.quality)}</span>` : ''}${m.releaseDate ? `<span class="dot">•</span><span>${escapeHtml(m.releaseDate)}</span>` : ''}</div>
            <div class="modal__badges">${buildBadges(m)}</div>
          </div>
        </div>
      </div>
      <div class="modal__body-content">
        <div class="modal__actions">
          ${downloads.length ? `<button class="btn btn--primary" id="openPlayerBtn">▶ Play / Download</button>` : ''}
          ${m.trailer ? `<a class="btn btn--ghost" href="${escapeHtml(m.trailer)}" target="_blank" rel="noopener">▶ Trailer</a>` : ''}
          <button class="btn btn--ghost" id="favBtn" data-fav="${isFav ? '1' : '0'}">${isFav ? '★ Watchlisted' : '☆ Watchlist'}</button>
        </div>
        ${m.description ? `<div class="modal__section"><div class="modal__section-title">Synopsis</div><p class="modal__story">${escapeHtml(m.description)}</p></div>` : ''}
        <div class="modal__section">
          <div class="modal__section-title">Info</div>
          <div class="modal__info-grid">
            ${m.country ? `<div class="modal__info-item"><span class="label">Country</span><span class="value">${escapeHtml(m.country)}</span></div>` : ''}
            ${m.quality ? `<div class="modal__info-item"><span class="label">Quality</span><span class="value">${escapeHtml(m.quality)}</span></div>` : ''}
            ${m.releaseDate ? `<div class="modal__info-item"><span class="label">Released</span><span class="value">${escapeHtml(m.releaseDate)}</span></div>` : ''}
            ${m.genres && m.genres.length ? `<div class="modal__info-item"><span class="label">Genres</span><span class="value">${escapeHtml(m.genres.join(', '))}</span></div>` : ''}
            ${m.actors && m.actors.length ? `<div class="modal__info-item"><span class="label">Cast</span><span class="value">${escapeHtml(m.actors.slice(0, 3).join(', '))}</span></div>` : ''}
          </div>
        </div>
        ${downloads.length ? `<div class="modal__section"><div class="modal__section-title">Download Links</div><div class="qualities">
          ${downloads.map((d, i) => `<a class="quality-card" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">
            <span class="quality-card__icon"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 20h14v-2H5zm7-18-5 5h3v6h4v-6h3z"/></svg></span>
            <span class="quality-card__info"><span class="quality-card__title">${escapeHtml(d.quality || 'Download')}</span><span class="quality-card__meta">${escapeHtml(d.host)}</span></span>
            <span class="quality-card__arrow"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></span>
          </a>`).join('')}
        </div></div>` : ''}
      </div>`;
    const openBtn = $('#openPlayerBtn');
    if (openBtn) openBtn.addEventListener('click', () => { openPlayerSheet(m.streamUrl, m.title, m.quality, m.slug); });
    const favBtn = $('#favBtn');
    if (favBtn) favBtn.addEventListener('click', () => toggleFav(m, favBtn));
  }

  function toggleFav(m, btn) {
    haptic('light');
    const favs = ls.get('krx18.favs', []);
    const idx = favs.findIndex((f) => f.slug === m.slug);
    if (idx >= 0) { favs.splice(idx, 1); btn.textContent = '☆ Watchlist'; btn.setAttribute('data-fav', '0'); toast('Removed from watchlist'); }
    else { favs.push({ slug: m.slug, title: m.title, poster: m.poster, quality: m.quality, addedAt: Date.now() }); btn.textContent = '★ Watchlisted'; btn.setAttribute('data-fav', '1'); toast('Added to watchlist', 'success'); haptic('success'); }
    ls.set('krx18.favs', favs);
  }

  function closeModal() { clearInterval(state.pollInterval); dom.modal.hidden = true; dom.modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; state.currentMovieSlug = null; dom.modalBody.innerHTML = ''; if (!dom.sheet.hidden || !dom.settingsSheet.hidden) return; showBackButton(false); }

  function openSettings() {
    haptic('light');
    const s = state.settings;
    dom.settingsList.innerHTML = `
      <div class="settings-item"><span class="settings-item__label">📳 Haptic feedback</span><button class="settings-toggle ${s.haptics ? 'is-on' : ''}" data-key="haptics"></button></div>
      <div class="settings-item"><span class="settings-item__label">📉 Low data mode</span><button class="settings-toggle ${s.lowData ? 'is-on' : ''}" data-key="lowData"></button></div>
      <div class="settings-item"><span class="settings-item__label">👤 Telegram user</span><span class="settings-item__value">${state.tgUser ? escapeHtml(state.tgUser.first_name || state.tgUser.username || state.tgUser.id) : 'Not in Telegram'}</span></div>
      <div class="settings-item"><span class="settings-item__label">🌐 App version</span><span class="settings-item__value">v6.0.0</span></div>
      <div class="settings-item"><span class="settings-item__label">⭐ Watchlist</span><span class="settings-item__value">${ls.get('krx18.favs', []).length} movies</span></div>
    `;
    dom.settingsSheet.hidden = false;
    document.body.style.overflow = 'hidden';
    showBackButton(true);
    $$('.settings-toggle').forEach((t) => {
      t.addEventListener('click', () => {
        const key = t.getAttribute('data-key');
        state.settings[key] = !state.settings[key];
        t.classList.toggle('is-on', state.settings[key]);
        ls.set('krx18.settings', state.settings);
        haptic('light');
      });
    });
  }
  function closeSettings() { dom.settingsSheet.hidden = true; if (dom.modal.hidden && dom.sheet.hidden) { document.body.style.overflow = ''; showBackButton(false); } }

  function updateSectionHead() {
    const titles = { latest: state.filter === 'all' ? 'Latest Korean Movies' : `${state.filter.toUpperCase()} Movies`, search: `Search: "${state.searchQuery}"` };
    dom.sectionTitle.textContent = titles[state.view] || 'Movies';
    dom.sectionCount.textContent = state.items.length ? `${state.items.length}+` : '';
  }

  const onSearch = debounce((q) => {
    q = (q || '').trim();
    state.searchQuery = q;
    if (!q) { if (state.view === 'search') { state.view = 'latest'; state.page = 1; state.items = []; state.hasMore = true; updateSectionHead(); loadList(); } dom.searchClear.hidden = true; return; }
    dom.searchClear.hidden = false;
    state.view = 'search'; state.page = 1; state.items = []; state.hasMore = true; state.filter = 'all';
    renderFilters(); updateSectionHead(); dom.hero.hidden = true; loadList();
  }, 350);

  function switchView(view) {
    haptic('selection');
    if (state.view === view && view !== 'latest') return;
    state.view = view; state.page = 1; state.items = []; state.hasMore = true;
    state.filter = 'all'; state.searchQuery = '';
    dom.searchInput.value = ''; dom.searchClear.hidden = true;
    renderFilters(); updateSectionHead();
    if (view !== 'latest') dom.hero.hidden = true;
    loadList();
  }

  function wireEvents() {
    dom.searchInput.addEventListener('input', (e) => onSearch(e.target.value));
    dom.searchForm.addEventListener('submit', (e) => { e.preventDefault(); onSearch(dom.searchInput.value); });
    dom.searchClear.addEventListener('click', () => { dom.searchInput.value = ''; dom.searchClear.hidden = true; onSearch(''); dom.searchInput.focus(); });
    dom.filtersScroll.addEventListener('click', (e) => { const b = e.target.closest('.pill'); if (b) setFilter(b.getAttribute('data-filter')); });
    dom.grid.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openMovie(c.getAttribute('data-slug')); });
    dom.grid.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = e.target.closest('.card'); if (c) { e.preventDefault(); openMovie(c.getAttribute('data-slug')); } });
    dom.heroPlay.addEventListener('click', () => { if (state.heroItem) openMovie(state.heroItem.slug); });
    dom.heroDetails.addEventListener('click', () => { if (state.heroItem) openMovie(state.heroItem.slug); });
    dom.modal.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(); });
    dom.sheet.addEventListener('click', (e) => { if (e.target.matches('[data-close-sheet]')) closeSheet(); });
    dom.settingsSheet.addEventListener('click', (e) => { if (e.target.matches('[data-close-settings]')) closeSettings(); });
    dom.settingsBtn.addEventListener('click', openSettings);
    dom.sheetCopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(dom.sheetUrl.value); toast('URL copied', 'success'); haptic('success'); } catch { toast('Copy failed', 'error'); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!dom.sheet.hidden) closeSheet(); else if (!dom.settingsSheet.hidden) closeSettings(); else if (!dom.modal.hidden) closeModal(); } });
    dom.loadMoreBtn.addEventListener('click', () => { if (state.isLoading || !state.hasMore) return; state.page++; loadList({ append: true }); });
    let scrollPending = false;
    window.addEventListener('scroll', () => {
      if (scrollPending) return; scrollPending = true;
      requestAnimationFrame(() => { scrollPending = false; if (state.isLoading || !state.hasMore || state.view === 'search') return; if (document.body.scrollHeight - (window.scrollY + window.innerHeight) < 800) { state.page++; loadList({ append: true }); } });
    }, { passive: true });
  }

  function closeSheet() {
    clearInterval(state.pollInterval);
    dom.sheet.hidden = true;
    dom.sheet.setAttribute('aria-hidden', 'true');
    if (dom.modal.hidden && dom.settingsSheet.hidden) {
      document.body.style.overflow = '';
      showBackButton(false);
    }
  }

  function openPlayerSheet(streamUrl, title, quality, slug) {
    haptic('light');
    dom.sheet.hidden = false;
    dom.sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    showBackButton(true);

    dom.sheetTitle.textContent = prettyTitle(title);
    dom.sheetHint.textContent = quality ? `Quality: ${quality}` : '';

    if (streamUrl) {
      clearInterval(state.pollInterval);
      const cleanUrl = streamUrl.replace(/^https?:\/\//, "");
      const mxUrl = `intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;end`;
      const vlcUrl = `vlc://${streamUrl}`;
      const jpUrl = `intent://${cleanUrl}#Intent;package=com.brouken.player;end`;
      const mpvUrl = `mpv://${streamUrl}`;

      dom.sheetGrid.innerHTML = `
        <a class="sheet__btn" href="${mxUrl}">
          <span class="sheet__btn-icon">📱</span>
          <span>MX Player</span>
        </a>
        <a class="sheet__btn" href="${vlcUrl}">
          <span class="sheet__btn-icon">🧡</span>
          <span>VLC</span>
        </a>
        <a class="sheet__btn" href="${jpUrl}">
          <span class="sheet__btn-icon">🎬</span>
          <span>Just Player</span>
        </a>
        <a class="sheet__btn" href="${mpvUrl}">
          <span class="sheet__btn-icon">👽</span>
          <span>MPV</span>
        </a>
        <a class="sheet__btn sheet__btn--primary" href="${streamUrl}" target="_blank" rel="noopener">
          <span class="sheet__btn-icon">⬇️</span>
          <span>Download</span>
        </a>
      `;

      dom.sheetUrl.value = streamUrl;
      $('.sheet__url').style.display = 'flex';
      dom.sheetTip.innerHTML = `💡 <b>MX/VLC Network Stream:</b> Click a player button above to stream directly, or copy the proxy URL below and paste it in your player.`;
      dom.sheetTip.style.display = 'block';
    } else {
      dom.sheetGrid.innerHTML = `
        <div class="extraction-loading" style="grid-column: 1 / -1; text-align: center; padding: 20px 0;">
          <div class="splash__spinner" style="margin: 0 auto 16px;"></div>
          <p style="font-weight: 700; margin-bottom: 8px;">⏳ Generating Premium Link...</p>
          <p style="font-size: 12px; color: var(--text-2); max-width: 280px; margin: 0 auto; line-height: 1.4;">
            We are opening a Puppeteer browser via GitHub Actions to bypass overlays and extract the direct abysscdn link. This takes about 30-90 seconds.
          </p>
        </div>
      `;
      $('.sheet__url').style.display = 'none';
      dom.sheetTip.style.display = 'none';

      triggerExtraction(slug);
    }
  }

  async function triggerExtraction(slug) {
    clearInterval(state.pollInterval);
    const userId = state.tgUser ? state.tgUser.id : 0;
    try {
      await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, userId, server: '2' })
      });
      
      state.pollCount = 0;
      state.pollInterval = setInterval(async () => {
        state.pollCount++;
        if (state.pollCount > 25) {
          clearInterval(state.pollInterval);
          showExtractionError("Extraction timed out. Please try again.");
          return;
        }
        
        try {
          const r = await fetchJson(`${API.movie}?slug=${encodeURIComponent(slug)}`);
          if (r.streamUrl) {
            clearInterval(state.pollInterval);
            toast('Premium URL extracted successfully!', 'success');
            openPlayerSheet(r.streamUrl, r.title, r.quality, slug);
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 4000);
      
    } catch (e) {
      console.error(e);
      showExtractionError("Failed to trigger link extraction.");
    }
  }

  function showExtractionError(msg) {
    dom.sheetGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--brand-2);">
        <p style="font-weight: 700; margin-bottom: 10px;">❌ Extraction Failed</p>
        <p style="font-size: 12px; color: var(--text-2); margin-bottom: 14px;">${msg}</p>
        <button class="btn btn--ghost btn--small" id="retryExtractBtn">Retry Extraction</button>
      </div>
    `;
    const retryBtn = $('#retryExtractBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        openPlayerSheet(null, dom.sheetTitle.textContent, dom.sheetHint.textContent, state.currentMovieSlug);
      });
    }
  }

  function init() {
    cacheDom();
    state.settings = { ...state.settings, ...ls.get('krx18.settings', {}) };
    initTelegram();
    renderFilters();
    wireEvents();
    updateSectionHead();
    loadList();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
