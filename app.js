(() => {
  'use strict';

  const DB_NAME = 'trpg-scenario-manager';
  const DB_VERSION = 1;
  // バックアップ形式のバージョン。新しい項目を追加するときは、既存データを
  // 壊さないように migrateBackupPayload / normalizeScenario を拡張する。
  const BACKUP_VERSION = 2;
  const FIRST_SUPPORTED_BACKUP_VERSION = 1;
  const APP_NAME = 'TRPG Scenario Manager';
  const APP_VERSION = '1.0.1';
  const BACKUP_DIRECTORY_NAME = 'TRPG Scenario Manager Backups';

  const MASTER = {
    systems: ['クトゥルフ神話TRPG（6版）', '新クトゥルフ神話TRPG（7版）', 'エモクロアTRPG', 'マーダーミステリー', 'インセイン', 'ダブルクロス The 3rd Edition', 'シノビガミ', 'ソード・ワールド2.5', '永い後日談のネクロニカ', 'フタリソウサ', 'ストリテラ', 'その他'],
    versions: {},
    lostRates: ['なし', '低', '中', '高', '極高', '不明'],
    hoTypes: ['なし', '共通HO', '個別HO', '秘匿HOあり', '共通＋個別HO', '特殊'],
    combat: ['あり', 'なし', '場合による'],
    kpStatus: ['未KP', 'KP済み'],
    playStatus: ['未通過', '通過済み'],
    trends: ['ホラー', '推理', '謎解き', '戦闘', 'RP重視', 'エモーショナル', 'シリアス', '愉快', 'ギャグ', '刑事', '青春', '恋愛', 'うちよそ', '探索重視', '高難易度', '初心者向け', '秘匿HO', 'クローズド', 'シティ']
  };

  const state = { route: {}, scenarios: [], drafts: [], settings: { theme: 'light', confirmDelete: true, promptBackup: false, discordFormat: defaultDiscordFormat() }, filters: { keyword: '', system: '', favorite: '', count: '', time: '', lost: '', trend: '', play: '', kp: '', combat: '', sort: 'updatedAt-desc' }, editImages: [], editHoItems: [{ type: '', content: '' }], editHoType: '', activeDraftId: null, pendingScenarioTransition: null, mobileMenuOpen: false };
  let db;

  function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
  function now() { return new Date().toISOString(); }
  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
  function escAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function formatDate(value) { if (!value) return '未設定'; return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(value)); }
  function formatDateTime(value) { if (!value) return '未設定'; return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  function display(value) { return value ? escapeHtml(value) : '<span class="muted">未設定</span>'; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function textValue(value) { return Array.isArray(value) ? value.join('、') : String(value || ''); }
  function tagColor(value) {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    return `tag-color-${Math.abs(hash) % 8}`;
  }
  function tagMarkup(value, index = 0) {
    return `<span class="tag ${tagColor(value)}" data-tag-index="${index}">${escapeHtml(value)}</span>`;
  }
  function toast(message, error = false) { const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message; document.querySelector('#toast-region').appendChild(el); setTimeout(() => el.remove(), 3500); }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { const database = request.result; ['scenarios', 'drafts', 'settings'].forEach(store => { if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: 'id' }); }); };
      request.onsuccess = () => { db = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }
  function readAll(store) { return new Promise((resolve, reject) => { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error); }); }
  function put(store, value) { return new Promise((resolve, reject) => { const r = db.transaction(store, 'readwrite').objectStore(store).put(value); r.onsuccess = () => resolve(value); r.onerror = () => reject(r.error); }); }
  function remove(store, id) { return new Promise((resolve, reject) => { const r = db.transaction(store, 'readwrite').objectStore(store).delete(id); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }); }
  async function refreshData() { [state.scenarios, state.drafts] = await Promise.all([readAll('scenarios'), readAll('drafts')]); state.scenarios = state.scenarios.filter(isObject).map(normalizeScenario); state.drafts = state.drafts.map(draft => ({ ...draft, data: isObject(draft.data) ? normalizeScenario(draft.data) : blankData() })); const saved = await readAll('settings'); if (saved[0]?.value) state.settings = { ...state.settings, ...saved[0].value, discordFormat: normalizeDiscordFormat(saved[0].value.discordFormat) }; applyTheme(); }
  async function saveSettings() { await put('settings', { id: 'app-settings', value: state.settings }); applyTheme(); }
  function applyTheme() { const theme = state.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.settings.theme; document.body.dataset.theme = theme; document.documentElement.dataset.theme = theme; }

  function routeFromHash() {
    const raw = location.hash.replace(/^#/, '') || 'list'; const [page, id] = raw.split('/'); state.route = { page, id: id || null }; return state.route;
  }
  function go(page, id = '') { location.hash = id ? `#${page}/${id}` : `#${page}`; }
  function header(active) {
    return `<header class="app-header"><a class="brand" href="#list"><span class="brand-icon-frame"><img class="brand-icon brand-icon-base" src="appIcon2.png" alt=""><img class="brand-icon brand-icon-red" src="appIcon2.png" alt=""></span><span>${APP_NAME}</span></a><div class="header-menu${state.mobileMenuOpen ? ' open' : ''}" id="header-menu"><div class="header-search"><div class="search-box"><span>⌕</span><input id="global-search" type="search" placeholder="検索（タイトル・作者・舞台など）" value="${escAttr(state.filters.keyword)}" aria-label="キーワード検索"></div></div><nav class="main-nav" aria-label="メインナビゲーション"><a class="nav-link ${active === 'list' ? 'active' : ''}" href="#list">一覧</a><a class="nav-link ${active === 'backup' ? 'active' : ''}" href="#backup">バックアップ</a><a class="nav-link ${active === 'discord-format' ? 'active' : ''}" href="#discord-format">Discord形式</a><a class="nav-link ${active === 'settings' ? 'active' : ''}" href="#settings">設定</a></nav></div><div class="header-actions"><button class="btn primary" data-action="new" aria-label="新規シナリオ登録">＋ 新規登録</button><button class="btn menu-toggle" type="button" data-action="toggle-menu" aria-controls="header-menu" aria-expanded="${state.mobileMenuOpen ? 'true' : 'false'}" aria-label="メニューを開く">☰</button></div></header>`;
  }
  function page(content, active) { document.querySelector('#app').innerHTML = `${header(active)}<main class="page">${content}</main>`; removeVersionField(); bindGlobal(); if (content.includes('id="scenario-form"')) { setupHoFields(); repairHoTypeField(); syncHoFields(); setupCampaignFields(); addKpLessOption(); adjustCampaignLayout(); } }
  function removeVersionField() {
    document.querySelectorAll('#version').forEach(element => { const field = element.closest('.field'); if (field) field.hidden = true; });
    document.querySelectorAll('.data-item').forEach(item => { if (item.querySelector('.data-label')?.textContent.trim() === '\u5bfe\u5fdc\u7248') item.remove(); });
    document.querySelector('.hero-status .tag:nth-child(2)')?.remove();
  }
  function migrateScenarioSystem(scenario) {
    const basic = scenario.basic || {};
    const system = basic.system === 'クトゥルフ神話TRPG' && basic.version === '第6版' ? 'クトゥルフ神話TRPG（6版）' : basic.system === '新クトゥルフ神話TRPG' ? '新クトゥルフ神話TRPG（7版）' : basic.system === 'クトゥルフ神話TRPG' && basic.version === '第7版' ? '新クトゥルフ神話TRPG（7版）' : basic.system;
    if (system === basic.system && !basic.version) return scenario;
    return { ...scenario, basic: { ...basic, system, version: '' } };
  }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function clamp(value, min = 0, max = 100) { return Math.min(max, Math.max(min, Number(value) || 0)); }
  function normalizeTrailerImage(image) {
    if (typeof image === 'string' && image) return { src: image, position: { x: 50, y: 50 }, zoom: 1 };
    if (!isObject(image) || typeof image.src !== 'string' || !image.src) return null;
    return { src: image.src, position: { x: image.position?.x === undefined ? 50 : clamp(image.position.x, 0, 100), y: image.position?.y === undefined ? 50 : clamp(image.position.y, 0, 100) }, zoom: image.zoom === undefined ? 1 : clamp(image.zoom, 1, 3) };
  }
  function imagePositionStyle(image) {
    // At 1x there is no crop area to pan, so a stale/legacy position must not
    // make an otherwise normal image appear off-center.
    if (imageZoom(image) <= 1) return 'object-position: 50% 50%';
    const position = image?.position || {};
    return `object-position: ${position.x === undefined ? 50 : clamp(position.x, 0, 100)}% ${position.y === undefined ? 50 : clamp(position.y, 0, 100)}%`;
  }
  function imageZoom(image) { return image?.zoom === undefined ? 1 : clamp(image.zoom, 1, 3); }
  function imageZoomStyle(image) { const zoom = imageZoom(image); const x = image?.position?.x === undefined ? 50 : clamp(image.position.x, 0, 100); const y = image?.position?.y === undefined ? 50 : clamp(image.position.y, 0, 100); return `transform: translate(${(50 - x) * (zoom - 1)}%, ${(50 - y) * (zoom - 1)}%) scale(${zoom}); transform-origin: center`; }
  function normalizeScenario(scenario, index = 0) {
    if (!isObject(scenario)) throw new Error(`invalid-scenario-${index}`);
    const defaults = blankData();
    const normalized = {
      ...scenario,
      id: String(scenario.id || uid('scenario')),
      favorite: Boolean(scenario.favorite),
      basic: { ...defaults.basic, ...(isObject(scenario.basic) ? scenario.basic : {}) },
      campaign: { ...defaults.campaign, ...(isObject(scenario.campaign) ? scenario.campaign : {}) },
      scenario: { ...defaults.scenario, ...(isObject(scenario.scenario) ? scenario.scenario : {}) },
      trailer: { ...defaults.trailer, ...(isObject(scenario.trailer) ? scenario.trailer : {}) },
      personal: { ...defaults.personal, ...(isObject(scenario.personal) ? scenario.personal : {}) },
      createdAt: scenario.createdAt || now(),
      updatedAt: scenario.updatedAt || scenario.createdAt || now()
    };
    normalized.scenario.recommendedSkills = textValue(normalized.scenario.recommendedSkills);
    normalized.scenario.secondarySkills = textValue(normalized.scenario.secondarySkills);
    normalized.scenario.trends = array(normalized.scenario.trends);
    normalized.trailer.images = array(normalized.trailer.images).map(normalizeTrailerImage).filter(Boolean);
    normalized.campaign.episodes = array(normalized.campaign.episodes).map((episode, episodeIndex) => ({
      number: episode.number || episodeIndex + 1,
      title: episode.title || '', timeType: episode.timeType || 'fixed',
      timeValue: episode.timeValue ?? '', timeUnit: episode.timeUnit || '時間',
      timeFree: episode.timeFree || '', summary: episode.summary || '',
      status: episode.status || '未プレイ', playDate: episode.playDate || ''
    }));
    normalized.campaign.episodeCount = normalized.campaign.episodes.length;
    return migrateScenarioSystem(normalized);
  }
  function migrateBackupPayload(payload, version) {
    const ids = new Set();
    const scenarios = payload.scenarios.map((scenario, index) => {
      const normalized = normalizeScenario(scenario, index);
      if (ids.has(normalized.id)) normalized.id = uid('scenario');
      ids.add(normalized.id);
      return normalized;
    });
    let migrated = { ...payload, scenarios };
    // v1 は現在のシナリオ構造を内包しているため、v2では不足項目の補完のみ行う。
    // 将来 v3 以降を追加する場合は、ここで version ごとの移行を順番に行う。
    if (version === 1) migrated = { ...migrated, scenarios: migrated.scenarios.map(normalizeScenario) };
    return { ...migrated, dataVersion: BACKUP_VERSION };
  }
  function parseBackupPayload(payload) {
    if (!isObject(payload) || payload.appName !== APP_NAME || !Array.isArray(payload.scenarios)) throw new Error('unsupported');
    // dataVersion がない古いバックアップも、初期形式(v1)として扱う。
    const version = payload.dataVersion === undefined ? 1 : Number(payload.dataVersion);
    if (!Number.isInteger(version) || version < FIRST_SUPPORTED_BACKUP_VERSION || version > BACKUP_VERSION) throw new Error('unsupported');
    return migrateBackupPayload(payload, version);
  }
  function replaceScenarios(records) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('scenarios', 'readwrite');
      const store = transaction.objectStore('scenarios');
      store.clear();
      records.forEach(record => store.put(record));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('restore-aborted'));
    });
  }
  function bindGlobal() { const search = document.querySelector('#global-search'); let composing = false; const renderSearchResults = input => { state.filters.keyword = input.value; if (state.route.page !== 'list') return; const start = input.selectionStart; const end = input.selectionEnd; renderList(); const nextInput = document.querySelector('#global-search'); nextInput?.focus(); if (start !== null && end !== null) nextInput?.setSelectionRange(start, end); }; search?.addEventListener('compositionstart', () => { composing = true; }); search?.addEventListener('compositionend', e => { composing = false; renderSearchResults(e.target); }); search?.addEventListener('input', e => { if (composing || e.isComposing) { state.filters.keyword = e.target.value; return; } renderSearchResults(e.target); }); document.querySelectorAll('[data-action="new"]').forEach(button => button.addEventListener('click', () => { state.mobileMenuOpen = false; go('edit', 'new'); })); document.querySelector('[data-action="toggle-menu"]')?.addEventListener('click', () => { state.mobileMenuOpen = !state.mobileMenuOpen; const menu = document.querySelector('#header-menu'); const toggle = document.querySelector('[data-action="toggle-menu"]'); menu?.classList.toggle('open', state.mobileMenuOpen); toggle?.setAttribute('aria-expanded', String(state.mobileMenuOpen)); }); document.querySelectorAll('#header-menu .nav-link').forEach(link => link.addEventListener('click', () => { state.mobileMenuOpen = false; })); }

  function optionList(items, selected = '', includeAll = false) { return `${includeAll ? '<option value="">すべて</option>' : '<option value="">選択してください</option>'}${items.map(item => { const x = typeof item === 'string' ? item : item.value; const label = typeof item === 'string' ? item : item.label; return `<option value="${escAttr(x)}" ${x === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }).join('')}`; }
  function scenarioText(s) { const b = s.basic || {}, sc = s.scenario || {}, p = s.personal || ''; return [b.title, b.author, b.system, b.stage, textValue(sc.recommendedSkills), textValue(sc.secondarySkills), sc.hoContent, p.memo].join(' ').toLowerCase(); }
  function isEnglishTitle(value) { return /^[A-Za-z]/.test(String(value || '').trim()); }
  function compareTitles(a, b, aReading = '', bReading = '') {
    const aEnglish = isEnglishTitle(a);
    const bEnglish = isEnglishTitle(b);
    if (aEnglish !== bEnglish) return aEnglish ? 1 : -1;
    const aSortValue = aReading || a;
    const bSortValue = bReading || b;
    return String(aSortValue || '').localeCompare(String(bSortValue || ''), 'ja');
  }
  function compareReading(a, b, aReading = '', bReading = '') {
    return String(aReading || a || '').localeCompare(String(bReading || b || ''), 'ja');
  }
  function personLabel(b) { if (b.countType === 'fixed') return `${b.fixedCount || '-'}人固定`; if (b.countType === 'range') return `${b.minCount || '-'}〜${b.maxCount || '-'}${b.maxCount === 'KP管理できる人数' ? '' : '人'}`; return b.freeCount || '自由入力'; }
  function timeText(value, unit) { return value ? `${value}${unit || '時間'}` : ''; }
  function timeLabel(b) { if (b.timeType === 'fixed') return b.fixedTimeValue ? timeText(b.fixedTimeValue, b.fixedTimeUnit) : (b.fixedTime || '未設定'); if (b.timeType === 'range') return b.minTimeValue || b.maxTimeValue ? `${timeText(b.minTimeValue, b.minTimeUnit) || '-'}〜${timeText(b.maxTimeValue, b.maxTimeUnit) || '-'}` : `${b.minTime || '-'}〜${b.maxTime || '-'}時間`; return b.freeTime || '自由入力'; }
  function parseTimeValue(value, unit) { if (value === '' || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number * (unit === '分' ? 1 : 60) : null; }
  function parseFreeTimeRange(value) { const values = [...String(value || '').matchAll(/(\d+(?:\.\d+)?)\s*(分|時間)?/g)].map(match => Number(match[1]) * (match[2] === '分' ? 1 : 60)).filter(Number.isFinite); return values.length ? [Math.min(...values), Math.max(...values)] : null; }
  function scenarioTimeRange(b) { if (b.timeType === 'fixed') { const value = parseTimeValue(b.fixedTimeValue, b.fixedTimeUnit); return value === null ? parseFreeTimeRange(b.fixedTime) : [value, value]; } if (b.timeType === 'range') { const min = parseTimeValue(b.minTimeValue, b.minTimeUnit) ?? parseFreeTimeRange(b.minTime)?.[0]; const max = parseTimeValue(b.maxTimeValue, b.maxTimeUnit) ?? parseFreeTimeRange(b.maxTime)?.[1]; return min === null && max === null ? null : [min ?? max, max ?? min]; } return parseFreeTimeRange(b.freeTime); }
  const timeFilters = [{ value: 'within-1', label: '1時間以内（0〜1時間）', min: 0, max: 60 }, { value: 'around-1', label: '1時間前後（1〜2時間）', min: 60, max: 120 }, { value: 'around-3', label: '3時間前後（2〜4時間）', min: 120, max: 240 }, { value: 'around-5', label: '5時間前後（4〜7時間）', min: 240, max: 420 }, { value: 'around-9', label: '9時間前後（7〜11時間）', min: 420, max: 660 }, { value: 'around-12', label: '12時間前後（11〜15時間）', min: 660, max: 900 }, { value: 'over-15', label: '15時間以上', min: 900, max: Infinity }];
  function matchesTimeFilter(b, value) { const filter = timeFilters.find(item => item.value === value); const range = scenarioTimeRange(b); if (!filter || !range) return false; const [min, max] = range; return filter.max === Infinity ? max >= filter.min : filter.value === 'within-1' ? min <= filter.max && max >= filter.min : max > filter.min && min <= filter.max; }
  function filteredScenarios() {
    const f = state.filters; let result = state.scenarios.filter(s => { const b = s.basic || {}, sc = s.scenario || {}, p = s.personal || ''; const keyword = f.keyword.trim().toLowerCase(); if (keyword && !scenarioText(s).includes(keyword)) return false; if (f.system && b.system !== f.system) return false; if (f.version && b.version !== f.version) return false; if (f.lost && sc.lostRate !== f.lost) return false; if (f.trend && !array(sc.trends).includes(f.trend)) return false; if (f.play && p.playStatus !== f.play) return false; if (f.kp && p.kpStatus !== f.kp) return false; if (f.combat && sc.combat !== f.combat) return false; if (f.count && !personLabel(b).includes(f.count)) return false; if (f.time && !matchesTimeFilter(b, f.time)) return false; return true; }); const [key, dir] = f.sort.split('-'); result.sort((a, b) => { let av = key === 'title' ? a.basic.title : key === 'author' ? a.basic.author : a[key]; let bv = key === 'title' ? b.basic.title : key === 'author' ? b.basic.author : b[key]; av = av || ''; bv = bv || ''; const cmp = key === 'title' ? compareTitles(a.basic.title, b.basic.title, a.basic.titleReading, b.basic.titleReading) : key === 'author' ? compareReading(a.basic.author, b.basic.author, a.basic.authorReading, b.basic.authorReading) : typeof av === 'string' ? av.localeCompare(bv, 'ja') : av - bv; return dir === 'asc' ? cmp : -cmp; }); return result; }
  const baseFilteredScenarios = filteredScenarios;
  filteredScenarios = () => { const result = baseFilteredScenarios(); return state.filters.favorite === 'favorite' ? result.filter(s => s.favorite) : result; };
  function selectFilter(id, label, items, value, includeAll = true) { return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${optionList(items, value, includeAll)}</select></div>`; }

  function renderList() {
    const f = state.filters; const items = filteredScenarios(); const cards = items.map(scenarioCard).join('');
    const sortOptions = [{ value: 'updatedAt-desc', label: '更新日（新しい順）' }, { value: 'updatedAt-asc', label: '更新日（古い順）' }, { value: 'title-asc', label: 'タイトル（昇順）' }, { value: 'title-desc', label: 'タイトル（降順）' }, { value: 'author-asc', label: '作者名（昇順）' }, { value: 'author-desc', label: '作者名（降順）' }, { value: 'createdAt-desc', label: '登録日（新しい順）' }, { value: 'createdAt-asc', label: '登録日（古い順）' }];
    page(`<div class="page-title-row"><div><h1 class="page-title">シナリオ一覧</h1><p class="page-subtitle">登録したシナリオを検索・絞り込みできます。</p></div></div><section class="panel filter-panel"><div class="filter-grid">${selectFilter('filter-system', 'システム', MASTER.systems, f.system)}</div><div class="filter-actions"><div class="sort-field">${selectFilter('filter-sort', '並び替え', sortOptions, f.sort, false)}</div><button class="btn" data-action="advanced">☷ 詳細フィルター</button><div class="spacer"></div><button class="btn" data-action="reset">↻ リセット</button></div><div class="advanced-filters" id="advanced-filters">${selectFilter('filter-version', '対応版', currentVersions(f.system), f.version)}${selectFilter('filter-count', '人数', ['1人', '2人', '3人', '4人', '5人', '6人以上'], f.count)}${selectFilter('filter-time', '時間', timeFilters, f.time)}${selectFilter('filter-lost', 'ロスト率', MASTER.lostRates, f.lost)}${selectFilter('filter-trend', 'タグ（シナリオ傾向）', MASTER.trends, f.trend)}${selectFilter('filter-kp', 'KP状態', MASTER.kpStatus, f.kp)}${selectFilter('filter-combat', '戦闘の有無', MASTER.combat, f.combat)}</div></section><div class="list-meta"><span>全 ${state.scenarios.length} 件中 ${items.length} 件を表示</span><span>${items.length ? 'カードを選択して詳細を表示' : ''}</span></div>${items.length ? `<div class="scenario-grid">${cards}</div>` : `<div class="empty-state"><div class="empty-icon">📚</div><h2>${state.scenarios.length ? '条件に一致するシナリオがありません' : 'シナリオが登録されていません'}</h2><p>${state.scenarios.length ? '検索条件や絞り込み条件を変更してください。' : '「＋新規登録」からシナリオを登録してください。'}</p>${state.scenarios.length ? '<button class="btn" data-action="reset">条件をリセット</button>' : '<button class="btn primary" data-action="new">＋ 新規登録</button>'}</div>`}`, 'list');
    const filterActions = document.querySelector('.filter-actions');
    if (filterActions) filterActions.insertAdjacentHTML('afterbegin', selectFilter('filter-favorite', 'お気に入り', [{ value: 'favorite', label: 'お気に入りのみ' }], f.favorite));
    document.querySelector('#filter-favorite')?.addEventListener('change', e => { state.filters.favorite = e.target.value; renderList(); });
    document.querySelectorAll('[data-action="reset"]').forEach(el => el.addEventListener('click', () => { state.filters.favorite = ''; }, { capture: true }));
    bindList();
  }
  function currentVersions() { return []; }
  async function toggleFavorite(id) { const scenario = detail(id); if (!scenario) return; scenario.favorite = !scenario.favorite; await put('scenarios', scenario); await refreshData(); toast(scenario.favorite ? 'お気に入りに追加しました' : 'お気に入りから外しました'); if (state.route.page === 'list') renderList(); else if (state.route.page === 'detail') renderDetail(id); }
  function bindList() { document.querySelectorAll('.scenario-card').forEach(el => { el.addEventListener('click', () => { const image = el.querySelector('img.card-image') || el.querySelector('.card-image'); const rect = image?.getBoundingClientRect(); state.pendingScenarioTransition = rect ? { id: el.dataset.id, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } } : null; go('detail', el.dataset.id); }); el.querySelector('[data-action="favorite"]')?.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(el.dataset.id); }); }); const ids = ['filter-system', 'filter-version', 'filter-count', 'filter-time', 'filter-lost', 'filter-trend', 'filter-play', 'filter-kp', 'filter-combat', 'filter-sort']; ids.forEach(id => document.querySelector(`#${id}`)?.addEventListener('change', e => { const map = { 'filter-system': 'system', 'filter-version': 'version', 'filter-count': 'count', 'filter-time': 'time', 'filter-lost': 'lost', 'filter-trend': 'trend', 'filter-play': 'play', 'filter-kp': 'kp', 'filter-combat': 'combat', 'filter-sort': 'sort' }; state.filters[map[id]] = e.target.value; if (id === 'filter-system') { state.filters.version = ''; renderList(); } else renderList(); })); document.querySelector('[data-action="advanced"]')?.addEventListener('click', () => document.querySelector('#advanced-filters')?.classList.toggle('open')); document.querySelectorAll('[data-action="reset"]').forEach(el => el.addEventListener('click', () => { Object.assign(state.filters, { keyword: '', system: '', version: '', count: '', time: '', lost: '', trend: '', play: '', kp: '', combat: '', sort: 'updatedAt-desc' }); renderList(); })); }

  function detail(id) { const found = state.scenarios.find(s => s.id === id); if (found) { state.editHoItems = normalizeHoItems(found.scenario || {}); state.editHoType = String(found.scenario?.hoType || '').split('\u001f')[0] || state.editHoItems[0]?.type || ''; } return found; }
  function carouselMarkup(images, id, alt) { if (!images.length) return '<div class="card-image placeholder">✦</div>'; const controls = images.length > 1 ? `<button type="button" class="carousel-button prev" data-carousel-prev aria-label="前の画像"></button><button type="button" class="carousel-button next" data-carousel-next aria-label="次の画像"></button><div class="carousel-counter" aria-live="polite">1 / ${images.length}</div>` : ''; return `<div class="detail-carousel" data-carousel="${id}" tabindex="0"><div class="carousel-track">${images.map((image, index) => `<img class="carousel-slide${index === 0 ? ' active' : ''}" draggable="false" src="${escAttr(image.src)}" alt="${escAttr(alt)}" aria-hidden="${index === 0 ? 'false' : 'true'}">`).join('')}</div>${controls}</div>`; }
  function renderDetail(id) { const s = detail(id); if (!s) return go('list'); const b = s.basic || {}, sc = s.scenario || {}, p = s.personal || {}, imgs = array(s.trailer?.images); page(`<a href="#list" class="back-link">← 一覧に戻る</a><div class="detail-hero"><div class="hero-images ${imgs.length < 2 ? 'single' : ''}">${carouselMarkup(imgs, 'hero', `${b.title}のトレーラー画像`)}</div><div class="hero-copy"><h1>${display(b.title)}</h1><div class="hero-status"><span class="tag">${display(b.system)}</span><span class="tag">${display(b.version)}</span><span class="tag warn">${escapeHtml(personLabel(b))}</span><span class="tag warn">${escapeHtml(timeLabel(b))}</span>${array(sc.trends).slice(0, 3).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join('')}</div><p class="author">作者名：${display(b.author)}</p><p class="summary">${display(sc.trailerSummary || s.trailer?.text)}</p></div></div><section class="section-card"><h2 class="section-heading">基本情報</h2><div class="data-grid"><div class="data-column">${dataItem('TRPGシステム', b.system)}${dataItem('対応版', b.version)}${dataItem('作者名', b.author)}${dataItem('舞台', b.stage)}</div><div class="data-column">${dataItem('人数', personLabel(b))}${dataItem('人数形式', countTypeLabel(b.countType))}${dataItem('固定人数', b.fixedCount ? `${b.fixedCount}人` : '')}${dataItem('最小人数', b.minCount ? `${b.minCount}人` : '')}${dataItem('最大人数', b.maxCount ? `${b.maxCount}人` : '')}</div><div class="data-column">${dataItem('時間', timeLabel(b))}${dataItem('時間形式', timeTypeLabel(b.timeType))}${dataItem('固定時間', b.fixedTime)}${dataItem('最短時間', b.minTime)}${dataItem('最長時間', b.maxTime)}</div></div></section><section class="section-card"><h2 class="section-heading">シナリオ情報</h2><div class="data-grid"><div class="data-column">${dataItem('推奨技能', textValue(sc.recommendedSkills))}${dataItem('準推奨技能', textValue(sc.secondarySkills))}${dataItem('非推奨', sc.notRecommended)}</div><div class="data-column">${dataItem('ロスト率', sc.lostRate)}${dataItem('ロスト率補足', sc.lostRateNote)}${dataItem('HO形式', sc.hoType)}${dataItem('HO内容', sc.hoContent)}</div><div class="data-column">${tagItem('シナリオ傾向', sc.trends)}${dataItem('戦闘の有無', sc.combat)}${dataItem('注意事項', sc.notes)}</div></div></section><section class="section-card"><h2 class="section-heading">個人管理</h2><div class="data-grid"><div class="data-column">${urlItem('購入・配布URL', p.url)}${dataItem('KP状態', p.kpStatus)}${dataItem('プレイ状態', p.playStatus)}</div><div class="data-column">${dataItem('自由メモ', p.memo)}</div><div class="data-column">${dataItem('登録日', formatDateTime(s.createdAt))}${dataItem('更新日', formatDateTime(s.updatedAt))}</div></div></section><div class="detail-actions"><button class="btn" data-action="back">← 一覧へ戻る</button><button class="btn" data-action="discord-copy">Discord用にコピー</button><button class="btn primary" data-action="edit">✎ 編集する</button><button class="btn danger" data-action="delete">♜ 削除する</button></div>`, 'list'); document.querySelector('[data-action="back"]').addEventListener('click', () => go('list')); document.querySelector('[data-action="edit"]').addEventListener('click', () => go('edit', id)); document.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(s)); document.querySelector('[data-action="discord-copy"]').addEventListener('click', () => copyDiscordScenario(s)); }
  function dataItem(label, value) { const shown = label === 'HO形式' ? String(value || '').replace(/\u001f/g, ' / ') : label === 'HO内容' ? String(value || '').replace(/\u001e/g, '\n\n') : value; return `<div class="data-item"><div class="data-label">${escapeHtml(label)}</div><div class="data-value">${typeof shown === 'string' && shown.includes('<span') ? shown : display(shown)}</div></div>`; }
  function discordValue(value, fallback = '未設定') { const text = Array.isArray(value) ? value.filter(Boolean).join('、') : String(value || '').trim(); return text || fallback; }
  function discordLine(label, value) { return `${label}：${discordValue(value)}`; }
  function discordHoBlocks(sc, format = { showLabels: true }) {
    const globalType = discordValue(sc.hoType, 'なし');
    const isSecret = globalType === '秘匿HOあり';
    const items = normalizeHoItems(sc).filter(item => item.content.trim());
    const contents = items.length ? items : String(sc.hoContent || '').split('\u001e').map(content => ({ type: '', content: content.trim() })).filter(item => item.content);
    if (globalType === 'なし') return ['なし'];
    if (!contents.length) return isSecret ? ['秘匿HOあり'] : ['なし'];
    const isMixed = globalType.includes('共通') && globalType.includes('個別');
    const isIndividual = (globalType.includes('個別') || isSecret) && !globalType.includes('共通');
    const publicItems = isIndividual ? [] : (isMixed ? contents.slice(0, 1) : contents);
    const individualItems = isIndividual ? contents : (isMixed ? contents.slice(1) : []);
    const formatItems = selected => selected.map(item => format.showLabels === false ? item.content.trim() : `HO：${item.content.trim()}`).join('\n\n');
    return [isSecret ? '秘匿HOあり' : '', formatItems(publicItems), formatItems(individualItems)].filter(Boolean);
  }
  function defaultDiscordFormat() {
    return { titleTemplate: '**{system}　{title}**', codeBlock: true, showLabels: true, sections: [
      { key: 'overview', title: '概要', enabled: true },
      { key: 'basic', title: '基本情報', enabled: true },
      { key: 'ho', title: 'HO', enabled: true },
      { key: 'notes', title: '注意点・補足事項', enabled: true }
    ], fields: {
      system: { enabled: true, label: 'システム' }, count: { enabled: true, label: '人数' }, stage: { enabled: true, label: '舞台' },
      recommendedSkills: { enabled: true, label: '推奨技能' }, secondarySkills: { enabled: true, label: '準推奨技能' }, combat: { enabled: true, label: '戦闘' },
      lostRate: { enabled: true, label: 'ロスト率' }, lostRateNote: { enabled: true, label: 'ロスト率補足' }, time: { enabled: true, label: 'プレイ時間' }, trends: { enabled: true, label: '傾向' },
      notRecommended: { enabled: true, label: '非推奨技能' }, notes: { enabled: true, label: '注意事項' },
      author: { enabled: false, label: '作者名' }, url: { enabled: false, label: '購入・配布URL' }, kpStatus: { enabled: false, label: 'KP状態' },
      playStatus: { enabled: false, label: 'プレイ状態' }, memo: { enabled: false, label: '自由メモ' }
    } };
  }
  function normalizeDiscordFormat(value) {
    const fallback = defaultDiscordFormat();
    if (!isObject(value)) return fallback;
    const savedSections = Array.isArray(value.sections) ? value.sections : [];
    const sections = [...savedSections.filter(item => fallback.sections.some(section => section.key === item.key)), ...fallback.sections.filter(section => !savedSections.some(item => item.key === section.key))].map(section => ({ ...fallback.sections.find(item => item.key === section.key), ...section }));
    const fields = Object.fromEntries(Object.entries(fallback.fields).map(([key, field]) => [key, { ...field, ...(value.fields?.[key] || {}) }]));
    return { ...fallback, ...value, sections, fields, titleTemplate: value.titleTemplate || fallback.titleTemplate };
  }
  function discordFormatField(format, key, label, value) { const field = format.fields[key]; if (field?.enabled === false) return ''; return format.showLabels === false ? discordValue(value) : discordLine(field?.label || label, value); }
  function discordScenarioText(s) {
    const b = s.basic || {}, sc = s.scenario || {}, c = s.campaign || {};
    const format = normalizeDiscordFormat(state.settings.discordFormat);
    const title = discordValue(b.title, 'シナリオ');
    const system = discordValue(b.system).replace(/（[^）]*）/g, '').trim();
    const contents = {
      overview: discordValue(s.trailer?.text),
      basic: [discordFormatField(format, 'system', 'システム', b.system), discordFormatField(format, 'count', '人数', personLabel(b)), discordFormatField(format, 'stage', '舞台', b.stage), discordFormatField(format, 'recommendedSkills', '推奨技能', textValue(sc.recommendedSkills)), discordFormatField(format, 'secondarySkills', '準推奨技能', textValue(sc.secondarySkills)), discordFormatField(format, 'combat', '戦闘', sc.combat), discordFormatField(format, 'lostRate', 'ロスト率', sc.lostRate), sc.lostRateNote ? discordFormatField(format, 'lostRateNote', 'ロスト率補足', sc.lostRateNote) : '', discordFormatField(format, 'time', 'プレイ時間', timeLabel(b)), b.scenarioType === 'campaign' && array(c.episodes).length ? `話数：${c.episodes.length}` : '', sc.trends?.length ? discordFormatField(format, 'trends', '傾向', array(sc.trends)) : '', discordFormatField(format, 'author', '作者名', b.author), discordFormatField(format, 'url', '購入・配布URL', s.personal?.url), discordFormatField(format, 'kpStatus', 'KP状態', s.personal?.kpStatus), discordFormatField(format, 'playStatus', 'プレイ状態', s.personal?.playStatus), discordFormatField(format, 'memo', '自由メモ', s.personal?.memo)].filter(Boolean).join('\n'),
      ho: discordHoBlocks(sc, format).join('\n\n'),
      notes: [discordFormatField(format, 'notRecommended', '非推奨技能', sc.notRecommended), discordFormatField(format, 'notes', '注意事項', sc.notes)].filter(Boolean).join('\n')
    };
    const codeBlock = content => ['```text', content, '```'].join('\n');
    const heading = section => `【${section.title}】`;
    const sections = format.sections.filter(section => section.enabled !== false).map(section => { const content = [heading(section), contents[section.key]].filter(Boolean).join('\n'); return format.codeBlock === false ? content : codeBlock(content); });
    return [format.titleTemplate.replaceAll('{system}', system).replaceAll('{title}', title), sections.join('\n\n')].filter(Boolean).join('\n\n');
  }
  async function copyDiscordScenario(s) { const text = discordScenarioText(s); try { await navigator.clipboard.writeText(text); toast('Discord用テキストをコピーしました'); } catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast('Discord用テキストをコピーしました'); } }
  function tagItem(label, values) { return `<div class="data-item"><div class="data-label">${escapeHtml(label)}</div><div class="tags">${array(values).length ? array(values).map((x, index) => label === 'シナリオ傾向' ? tagMarkup(x, index) : `<span class="tag">${escapeHtml(x)}</span>`).join('') : '<span class="muted">未設定</span>'}</div></div>`; }
  function urlItem(label, value) { return `<div class="data-item"><div class="data-label">${escapeHtml(label)}</div><div class="data-value">${value ? `<a class="url" href="${escAttr(value)}" target="_blank" rel="noopener">${escapeHtml(value)} ↗</a>` : '<span class="muted">未設定</span>'}</div></div>`; }
  function countTypeLabel(v) { return ({ fixed: '固定人数', range: '範囲指定', free: '自由入力' }[v] || '未設定'); }
  function timeTypeLabel(v) { return ({ fixed: '固定時間', range: '範囲指定', free: '自由入力' }[v] || '未設定'); }
  async function confirmDelete(s) { const run = async () => { await remove('scenarios', s.id); await refreshData(); toast('シナリオを削除しました'); go('list'); }; if (!state.settings.confirmDelete) return run(); showModal('シナリオを削除しますか？', `「${s.basic?.title || '無題のシナリオ'}」を削除すると元に戻せません。`, run, '削除する'); }

  function blankData() { return { favorite: false, basic: { title: '', titleReading: '', system: '', version: '', author: '', authorReading: '', scenarioType: 'normal', countType: 'fixed', fixedCount: '', minCount: '', maxCount: '', freeCount: '', timeType: 'fixed', fixedTime: '', fixedTimeValue: '', fixedTimeUnit: '時間', minTime: '', minTimeValue: '', minTimeUnit: '時間', maxTime: '', maxTimeValue: '', maxTimeUnit: '時間', freeTime: '', stage: '' }, campaign: { episodeCount: 0, episodes: [] }, scenario: { recommendedSkills: '', secondarySkills: '', notRecommended: '', lostRate: '', lostRateNote: '', hoType: '', hoContent: '', trends: [], combat: '', notes: '' }, trailer: { text: '', images: [] }, personal: { url: '', kpStatus: '', playStatus: '', memo: '' } }; }
  function inputField(label, key, value, opts = {}) { const required = opts.required ? ' <span class="required">*</span>' : ''; if (key === 'minCount' || key === 'maxCount') { const items = key === 'minCount' ? Array.from({ length: 5 }, (_, i) => String(i + 1)) : [...Array.from({ length: 15 }, (_, i) => String(i + 1)), 'KP管理できる人数']; return selectField(label, key, items, value ? String(value) : ''); } if (['fixedTime', 'minTime', 'maxTime'].includes(key)) { const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*(分|時間)/); const number = match ? match[1] : ''; const unit = match ? match[2] : '時間'; return `<div class="field"><label for="${key}">${label}${required}</label><div class="time-input"><input id="${key}" name="${key}" type="number" min="0" step="any" value="${escAttr(number)}" placeholder="数値"><select id="${key}Unit" name="${key}Unit"><option value="分" ${unit === '分' ? 'selected' : ''}>分</option><option value="時間" ${unit === '時間' ? 'selected' : ''}>時間</option></select></div></div>`; } const type = opts.type || 'text'; const attrs = `${opts.placeholder ? ` placeholder="${escAttr(opts.placeholder)}"` : ''}${opts.min !== undefined ? ` min="${opts.min}"` : ''}${opts.max !== undefined ? ` max="${opts.max}"` : ''}`; return `<div class="field"><label for="${key}">${label}${required}</label><input id="${key}" name="${key}" type="${type}" value="${escAttr(value)}"${attrs}></div>`; }
  function selectField(label, key, items, value, opts = {}) { return `<div class="field"><label for="${key}">${label}${opts.required ? ' <span class="required">*</span>' : ''}</label><select id="${key}" name="${key}">${optionList(items, value, false)}</select></div>`; }
  function textareaField(label, key, value, placeholder = '') { return `<div class="field"><label for="${key}">${label}</label><textarea id="${key}" name="${key}" placeholder="${escAttr(placeholder)}">${escapeHtml(value)}</textarea></div>`; }
  function radioField(label, name, current, options) { return `<div class="field"><label>${label} <span class="required">*</span></label><div class="radio-group">${options.map(([v, text]) => `<label class="radio-label"><input type="radio" name="${name}" value="${v}" ${current === v ? 'checked' : ''}>${text}</label>`).join('')}</div></div>`; }
  function renderEdit(id) { const editing = id && id !== 'new'; const scenario = editing ? detail(id) : null; const data = scenario ? JSON.parse(JSON.stringify(scenario)) : blankData(); state.editImages = array(data.trailer?.images).slice(); const b = data.basic, sc = data.scenario, p = data.personal; page(`<div class="edit-header"><a href="#${editing ? `detail/${id}` : 'list'}" class="back-link">← ${editing ? '詳細に戻る' : '一覧に戻る'}</a><h1 class="page-title">${editing ? 'シナリオを編集' : '新規シナリオ登録'}</h1><p class="page-subtitle">シナリオの情報を入力してください。</p></div><section class="panel draft-panel ${state.drafts.length ? 'open' : ''}" id="draft-panel"><div class="draft-panel-inner"><div class="field"><label for="draft-picker">保存済みの下書きから再開</label><select id="draft-picker"><option value="">下書きを選択してください</option>${state.drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(d => `<option value="${d.id}">${escapeHtml(d.data?.basic?.title || '無題の下書き')}（${formatDateTime(d.updatedAt)}）</option>`).join('')}</select></div><button class="btn" data-action="load-draft">下書きを開く</button><button class="btn danger" data-action="delete-draft">削除</button></div></section><form class="edit-form" id="scenario-form"><section class="section-card"><h2 class="section-heading">基本情報</h2><div class="form-grid"><div class="form-column">${inputField('タイトル', 'title', b.title, { required: true, placeholder: 'シナリオのタイトルを入力' })}${selectField('TRPGシステム', 'system', MASTER.systems, b.system, { required: true })}${selectField('対応版', 'version', currentVersions(b.system), b.version, { required: true })}${inputField('作者名', 'author', b.author)}${inputField('舞台', 'stage', b.stage, { placeholder: '例：現代日本、都市、クローズドシナリオなど' })}</div><div class="form-column">${radioField('人数形式', 'countType', b.countType, [['fixed', '固定人数'], ['range', '範囲指定'], ['free', '自由入力']])}<div class="conditional ${b.countType === 'fixed' ? 'visible' : ''}" data-condition="count-fixed">${selectField('固定人数', 'fixedCount', ['1人', '2人', '3人', '4人', '5人', '6人以上'].map(x => x.replace('人', '')), b.fixedCount ? String(b.fixedCount) : '')}</div><div class="conditional ${b.countType === 'range' ? 'visible' : ''}" data-condition="count-range"><div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">${inputField('最小人数', 'minCount', b.minCount, { type: 'number', min: 1 })}${inputField('最大人数', 'maxCount', b.maxCount, { type: 'number', min: 1 })}</div></div><div class="conditional ${b.countType === 'free' ? 'visible' : ''}" data-condition="count-free">${inputField('人数自由入力', 'freeCount', b.freeCount, { placeholder: '例：1〜4人程度' })}</div><span class="helper">人数形式に応じて、使用する項目を入力してください。</span></div><div class="form-column">${radioField('時間形式', 'timeType', b.timeType, [['fixed', '固定時間'], ['range', '範囲指定'], ['free', '自由入力']])}<div class="conditional ${b.timeType === 'fixed' ? 'visible' : ''}" data-condition="time-fixed">${inputField('固定時間', 'fixedTime', b.fixedTime, { placeholder: '例：約3時間' })}</div><div class="conditional ${b.timeType === 'range' ? 'visible' : ''}" data-condition="time-range"><div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">${inputField('最短時間', 'minTime', b.minTime, { placeholder: '例：約2時間' })}${inputField('最長時間', 'maxTime', b.maxTime, { placeholder: '例：約4時間' })}</div></div><div class="conditional ${b.timeType === 'free' ? 'visible' : ''}" data-condition="time-free">${inputField('時間自由入力', 'freeTime', b.freeTime, { placeholder: '例：約3〜4時間' })}</div><span class="helper">時間形式に応じて、使用する項目を入力してください。</span></div></div></section><section class="section-card"><h2 class="section-heading">シナリオ情報</h2><div class="form-grid"><div class="form-column">${textareaField('推奨技能', 'recommendedSkills', textValue(sc.recommendedSkills), '例：目星、聞き耳、図書館など、自由に入力してください')}${textareaField('準推奨技能', 'secondarySkills', textValue(sc.secondarySkills), '例：心理学、回避など、自由に入力してください')}${textareaField('非推奨', 'notRecommended', sc.notRecommended, '例：戦闘技能全般')}${selectField('ロスト率', 'lostRate', MASTER.lostRates, sc.lostRate, { required: true })}${textareaField('ロスト率補足', 'lostRateNote', sc.lostRateNote, 'ロスト率に関する補足説明')}</div><div class="form-column">${selectField('HO形式', 'hoType', MASTER.hoTypes, sc.hoType, { required: true })}${textareaField('HO内容', 'hoContent', sc.hoContent, 'HOの内容を入力')}${selectField('戦闘の有無', 'combat', MASTER.combat, sc.combat, { required: true })}</div><div class="form-column">${checkboxes('シナリオ傾向', 'trends', MASTER.trends, sc.trends)}${textareaField('注意事項', 'notes', sc.notes, 'プレイ前に注意すべき事項を入力')}</div></div></section><section class="section-card"><h2 class="section-heading">トレーラー</h2><div class="trailer-layout"><div>${textareaField('トレーラー文章', 'trailerText', data.trailer.text, 'シナリオのトレーラー・紹介文を入力してください。')}</div><div><div class="field"><label>トレーラー画像（複数枚可）</label><div class="image-upload"><div style="font-size:28px">▧</div><label for="trailer-images">画像をドラッグ＆ドロップ<br>または<br><span class="btn small soft">ファイルを選択</span></label><input id="trailer-images" type="file" accept="image/png,image/jpeg,image/webp" multiple></div><div id="image-previews" class="image-preview-list"></div></div></div></div></section><section class="section-card"><h2 class="section-heading">個人管理</h2><div class="form-grid"><div class="form-column">${inputField('購入・配布URL', 'url', p.url, { type: 'url', placeholder: 'https://example.com' })}${selectField('KP状態', 'kpStatus', MASTER.kpStatus, p.kpStatus)}${selectField('プレイ状態', 'playStatus', MASTER.playStatus, p.playStatus)}</div><div class="form-column">${textareaField('自由メモ', 'memo', p.memo, '個人的なメモを入力してください。')}</div><div class="form-column">${dataItem('登録日', scenario ? formatDateTime(scenario.createdAt) : '保存時に自動入力')}${dataItem('更新日', scenario ? formatDateTime(scenario.updatedAt) : '保存時に自動入力')}</div></div></section><div class="form-actions"><button type="button" class="btn" data-action="cancel">キャンセル</button><div class="action-right"><button type="button" class="btn soft" data-action="save-draft">下書き保存</button><button type="submit" class="btn primary">${editing ? '更新する' : '登録する'}</button></div></div></form>`, editing ? 'list' : 'list'); bindEdit(id, scenario); }
  function checkboxes(label, name, items, selected) { return `<div class="field"><label>${label}</label><div class="check-grid">${items.map(x => `<label class="check-label"><input type="checkbox" name="${name}" value="${escAttr(x)}" ${array(selected).includes(x) ? 'checked' : ''}>${escapeHtml(x)}</label>`).join('')}</div></div>`; }
  function renderPreviews() { const root = document.querySelector('#image-previews'); if (!root) return; root.innerHTML = state.editImages.map((src, i) => `<div class="image-preview"><img src="${src}" alt="選択したトレーラー画像 ${i + 1}"><button type="button" data-remove-image="${i}" aria-label="画像を削除">×</button></div>`).join(''); root.querySelectorAll('[data-remove-image]').forEach(btn => btn.addEventListener('click', () => { state.editImages.splice(Number(btn.dataset.removeImage), 1); renderPreviews(); })); }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve({ src: r.result, position: { x: 50, y: 50 }, zoom: 1 }); r.onerror = reject; r.readAsDataURL(file); }); }
  function isTrailerImage(file) { return file?.type ? ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) : /\.(png|jpe?g|webp)$/i.test(file?.name || ''); }
  async function addTrailerImages(files, input) {
    const imageFiles = [...(files || [])].filter(isTrailerImage);
    if (!imageFiles.length && files?.length) { toast('PNG・JPEG・WebP形式の画像を選択してください', true); return; }
    try {
      for (const file of imageFiles) state.editImages.push(await fileToDataUrl(file));
      renderPreviews();
    } catch { toast('画像の読み込みに失敗しました', true); }
    if (input) input.value = '';
  }
  async function saveDraft() { const data = readForm(); const existingId = document.querySelector('#draft-picker')?.value || state.activeDraftId; const existing = state.drafts.find(d => d.id === existingId); const draft = { id: existing?.id || uid('draft'), data, createdAt: existing?.createdAt || now(), updatedAt: now() }; await put('drafts', draft); state.activeDraftId = draft.id; await refreshData(); toast('下書きを保存しました'); renderEdit(state.route.id === 'new' ? 'new' : state.route.id); }

  function renderBackup() { page(`<div class="page-title-row"><div><h1 class="page-title">バックアップ・復元</h1><p class="page-subtitle">登録データを安全に保存・復元できます。</p></div></div><section class="section-card backup-card"><div class="backup-icon">↥</div><div><h2>バックアップ</h2><p>現在登録されているすべてのシナリオデータをJSONファイルとして保存します。</p><div class="backup-location"><strong>保存先</strong><span id="backup-location-name">未選択</span><button type="button" class="btn small" data-action="choose-backup-directory">保存先を選択</button><small>選択した場所に「${BACKUP_DIRECTORY_NAME}」フォルダを作成して保存します。</small></div></div><button class="btn primary" data-action="backup">バックアップを作成</button></section><section class="section-card backup-card"><div class="backup-icon">↧</div><div><h2>復元</h2><p>バックアップファイルを読み込み、保存されている登録済みデータを復元します。</p></div><div><input id="restore-file" type="file" accept="application/json,.json" hidden><button class="btn" data-action="choose-file">ファイルを選択</button><span id="file-name" class="helper">選択されていません</span><button class="btn primary" data-action="restore" disabled>復元する</button></div></section><section class="section-card notice"><h2 class="section-heading">注意事項</h2><ul><li>バックアップには登録済みシナリオの全データが含まれます。下書きは含まれません。</li><li>対応範囲の旧形式バックアップは最新版のデータ形式へ自動移行して復元します。</li><li>復元を実行すると、現在保存されている登録済みデータは上書きされます。</li><li>JSON形式のバックアップファイルのみ読み込めます。</li><li>重要なデータは定期的にバックアップしてください。</li></ul></section><div class="center-actions"><button class="btn" data-action="back">一覧へ戻る</button></div>`, 'backup'); bindBackup(); }
  function supportsDirectoryBackup() { return typeof window.showDirectoryPicker === 'function'; }
  function backupFileName() { return `trpg-scenario-manager-backup-${new Date().toISOString().slice(0, 10)}.json`; }
  async function chooseBackupDirectory() {
    if (!supportsDirectoryBackup()) return toast('このブラウザでは保存先の指定に対応していません。通常のダウンロードを使用します。', true);
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
      state.settings.backupDirectoryHandle = handle;
      await saveSettings();
      renderBackup();
      toast(`保存先を「${handle.name}」に設定しました`);
    } catch (error) {
      if (error?.name !== 'AbortError') toast('保存先の設定に失敗しました', true);
    }
  }
  async function hasBackupDirectoryPermission(handle) {
    if (!handle) return false;
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') permission = await handle.requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  }
  function downloadBackup(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }
  async function createBackup() {
    const payload = { appName: APP_NAME, dataVersion: BACKUP_VERSION, createdAt: now(), scenarios: state.scenarios.map(normalizeScenario) };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const fileName = backupFileName();
    const handle = state.settings.backupDirectoryHandle;
    if (supportsDirectoryBackup() && !handle) {
      toast('先にバックアップの保存先を選択してください', true);
      await chooseBackupDirectory();
      return;
    }
    if (supportsDirectoryBackup() && handle) {
      try {
        if (!await hasBackupDirectoryPermission(handle)) throw new Error('permission-denied');
        const backupDirectory = await handle.getDirectoryHandle(BACKUP_DIRECTORY_NAME, { create: true });
        const fileHandle = await backupDirectory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        toast(`バックアップを「${BACKUP_DIRECTORY_NAME}」に保存しました`);
        return;
      } catch (error) {
        if (error?.name === 'NotAllowedError') toast('保存先へのアクセスが許可されませんでした', true);
        else toast('指定した保存先に書き込めなかったため、ダウンロードに切り替えます', true);
      }
    }
    downloadBackup(blob, fileName);
    toast('バックアップをダウンロードしました');
  }
  function bindBackup() { const locationButton = document.querySelector('[data-action="choose-backup-directory"]'); const locationName = document.querySelector('#backup-location-name'); if (locationButton) locationButton.addEventListener('click', chooseBackupDirectory); if (locationName && state.settings.backupDirectoryHandle) locationName.textContent = state.settings.backupDirectoryHandle.name; if (!supportsDirectoryBackup()) { locationButton?.setAttribute('hidden', ''); if (locationName) locationName.textContent = 'このブラウザでは通常のダウンロードを使用します'; } document.querySelector('[data-action="backup"]').addEventListener('click', createBackup); const input = document.querySelector('#restore-file'); document.querySelector('[data-action="choose-file"]').addEventListener('click', () => input.click()); input.addEventListener('change', e => { document.querySelector('#file-name').textContent = e.target.files[0]?.name || '選択されていません'; document.querySelector('[data-action="restore"]').disabled = !e.target.files[0]; }); document.querySelector('[data-action="restore"]').addEventListener('click', () => restoreBackup(input.files[0])); document.querySelector('[data-action="back"]').addEventListener('click', () => go('list')); }
  async function restoreBackup(file) {
    if (!file) return;
    try {
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      showModal('データを復元しますか？', '現在保存されている登録済みデータはバックアップの内容で上書きされます。', async () => {
        await replaceScenarios(payload.scenarios);
        await refreshData();
        toast('データを復元しました');
        renderBackup();
      }, '復元する');
    } catch { toast('対応していないJSONファイルです', true); }
  }

  function renderDiscordFormat() {
    const format = normalizeDiscordFormat(state.settings.discordFormat);
    const fieldLabels = [['system', 'システム'], ['count', '人数'], ['stage', '舞台'], ['recommendedSkills', '推奨技能'], ['secondarySkills', '準推奨技能'], ['combat', '戦闘'], ['lostRate', 'ロスト率'], ['lostRateNote', 'ロスト率補足'], ['time', 'プレイ時間'], ['trends', '傾向'], ['notRecommended', '非推奨技能'], ['notes', '注意事項'], ['author', '作者名'], ['url', '購入・配布URL'], ['kpStatus', 'KP状態'], ['playStatus', 'プレイ状態'], ['memo', '自由メモ']];
    page(`<div class="page-title-row"><div><h1 class="page-title">Discord形式</h1><p class="page-subtitle">現在のコピペ形式を基準に、表示する項目や順番をアレンジできます。</p></div></div><form id="discord-format-form"><div class="format-layout"><div><section class="section-card format-card"><h2 class="section-heading">タイトルと全体設定</h2><div class="field"><label for="discord-title-template">タイトル形式</label><input id="discord-title-template" name="titleTemplate" value="${escAttr(format.titleTemplate)}"><small>{system} はシステム名、{title} はシナリオ名に置き換わります。</small></div><div class="setting-row format-toggle"><div class="setting-copy"><strong>各区分をコードブロックで囲む</strong><small>現在の形式ではオンです。</small></div><label class="toggle"><input name="codeBlock" type="checkbox" ${format.codeBlock !== false ? 'checked' : ''}><span></span></label></div><div class="setting-row format-toggle"><div class="setting-copy"><strong>コードブロック内の項目タイトルを表示する</strong><small>オフにすると「システム：」「人数：」などのラベルを外します。</small></div><label class="toggle"><input name="showLabels" type="checkbox" ${format.showLabels !== false ? 'checked' : ''}><span></span></label></div></section><section class="section-card format-card"><h2 class="section-heading">区分の表示・順番</h2><p class="helper format-intro">チェックを外すとその区分をコピー対象から外せます。矢印で順番を変更できます。</p><div id="discord-section-list" class="format-section-list">${format.sections.map((section, index) => `<div class="format-section-row" data-key="${section.key}"><label class="check-label"><input type="checkbox" name="section-enabled-${section.key}" ${section.enabled !== false ? 'checked' : ''}><span class="format-section-name">${escapeHtml(section.key === 'overview' ? '概要' : section.key === 'basic' ? '基本情報' : section.key === 'ho' ? 'HO' : '注意点・補足事項')}</span></label><input class="format-section-title" name="section-title-${section.key}" value="${escAttr(section.title)}" aria-label="${escapeHtml(section.title)}の見出し"><button type="button" class="btn small format-move" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn small format-move" data-direction="down" ${index === format.sections.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('')}</div></section><section class="section-card format-card"><h2 class="section-heading">項目の表示・ラベル</h2><p class="helper format-intro">チェックを外すと項目を非表示にできます。ラベルを変更するとDiscord上の表記も変わります。作者名・URL・KP状態などは追加項目です。</p><div class="format-field-list">${fieldLabels.map(([key, fallback]) => `<div class="format-field-row"><label class="check-label"><input type="checkbox" name="field-enabled-${key}" aria-label="${fallback}を表示" ${format.fields[key].enabled !== false ? 'checked' : ''}></label><input name="field-label-${key}" value="${escAttr(format.fields[key].label || fallback)}" aria-label="${fallback}のラベル"></div>`).join('')}</div></section></div><aside class="section-card format-preview-card"><h2 class="section-heading">プレビュー</h2><pre id="discord-format-preview" class="discord-preview"></pre><p class="helper">登録済みシナリオがある場合は、先頭のシナリオを使って表示します。</p></aside></div><div class="form-actions"><button type="button" class="btn" data-action="cancel">キャンセル</button><div class="action-right"><button type="button" class="btn soft" data-action="format-reset">初期形式に戻す</button><button type="submit" class="btn primary">保存</button></div></div></form>`, 'discord-format');
    bindDiscordFormat(format, fieldLabels);
  }
  function bindDiscordFormat(format, fieldLabels) {
    const form = document.querySelector('#discord-format-form');
    const preview = document.querySelector('#discord-format-preview');
    const currentScenario = state.scenarios[0] || normalizeScenario({ ...blankData(), basic: { ...blankData().basic, title: 'サンプルシナリオ', system: 'クトゥルフ神話TRPG（7版）', fixedCount: 4, fixedTime: '3時間' }, trailer: { text: 'ここにトレーラー文章が入ります。' } });
    const read = () => ({ titleTemplate: form.elements.titleTemplate.value || defaultDiscordFormat().titleTemplate, codeBlock: form.elements.codeBlock.checked, showLabels: form.elements.showLabels.checked, sections: [...document.querySelectorAll('.format-section-row')].map(row => ({ key: row.dataset.key, title: row.querySelector('.format-section-title').value || row.querySelector('.format-section-name').textContent, enabled: row.querySelector('input[type="checkbox"]').checked })), fields: Object.fromEntries(fieldLabels.map(([key, fallback]) => [key, { enabled: form.elements[`field-enabled-${key}`].checked, label: form.elements[`field-label-${key}`].value || fallback }])) });
    const updatePreview = () => { state.settings.discordFormat = read(); preview.textContent = discordScenarioText(currentScenario); };
    form.addEventListener('input', updatePreview);
    form.querySelectorAll('.format-move').forEach(button => button.addEventListener('click', () => { const row = button.closest('.format-section-row'); const sibling = button.dataset.direction === 'up' ? row.previousElementSibling : row.nextElementSibling; if (!sibling) return; if (button.dataset.direction === 'up') row.parentElement.insertBefore(row, sibling); else row.parentElement.insertBefore(sibling, row); [...row.parentElement.children].forEach((item, index, items) => { item.querySelector('[data-direction="up"]').disabled = index === 0; item.querySelector('[data-direction="down"]').disabled = index === items.length - 1; }); updatePreview(); }));
    form.querySelector('[data-action="format-reset"]').addEventListener('click', () => { state.settings.discordFormat = defaultDiscordFormat(); renderDiscordFormat(); });
    form.querySelector('[data-action="cancel"]').addEventListener('click', () => go('list'));
    form.addEventListener('submit', async event => { event.preventDefault(); state.settings.discordFormat = read(); await saveSettings(); toast('Discord形式を保存しました'); });
    updatePreview();
  }

  function renderSettings() { const s = state.settings; page(`<div class="page-title-row"><div><h1 class="page-title">設定</h1><p class="page-subtitle">アプリケーション全体の設定を変更できます。</p></div></div><form id="settings-form"><div class="settings-grid"><section class="section-card settings-card"><h2>表示設定</h2><div class="setting-row"><div class="setting-copy"><strong>テーマ</strong><small>アプリ全体の表示テーマ</small></div><select name="theme"><option value="light" ${s.theme === 'light' ? 'selected' : ''}>ライト</option><option value="middle" ${s.theme === 'middle' ? 'selected' : ''}>中間</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>ダーク</option><option value="system" ${s.theme === 'system' ? 'selected' : ''}>システム設定に合わせる</option></select></div></section><section class="section-card settings-card"><h2>データ設定</h2><div class="setting-row"><div class="setting-copy"><strong>削除時に確認ダイアログを表示する</strong><small>誤操作による削除を防ぎます</small></div><label class="toggle"><input name="confirmDelete" type="checkbox" ${s.confirmDelete ? 'checked' : ''}><span></span></label></div><div class="setting-row"><div class="setting-copy"><strong>保存後にバックアップを促す</strong><small>保存完了後に案内を表示します</small></div><label class="toggle"><input name="promptBackup" type="checkbox" ${s.promptBackup ? 'checked' : ''}><span></span></label></div></section><section class="section-card settings-card"><h2>アプリ情報</h2><dl class="about-list"><dt>アプリ名</dt><dd>${APP_NAME}</dd><dt>バージョン</dt><dd>${APP_VERSION}</dd><dt>開発者</dt><dd>TRPG Scenario Manager</dd><dt>ライセンス</dt><dd>未設定</dd></dl></section></div><div class="form-actions"><button type="button" class="btn" data-action="cancel">キャンセル</button><div class="action-right"><button type="submit" class="btn primary">保存</button></div></div></form>`, 'settings'); document.querySelector('#settings-form').addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.target); state.settings = { ...state.settings, theme: fd.get('theme'), confirmDelete: fd.get('confirmDelete') === 'on', promptBackup: fd.get('promptBackup') === 'on' }; await saveSettings(); toast('設定を保存しました'); }); document.querySelector('[data-action="cancel"]').addEventListener('click', () => go('list')); }

  function showModal(title, message, onConfirm, confirmLabel = '確認する') { const root = document.querySelector('#modal-root'); root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><div class="modal-actions"><button class="btn" data-modal-cancel>キャンセル</button><button class="btn danger" data-modal-confirm>${escapeHtml(confirmLabel)}</button></div></div></div>`; root.querySelector('[data-modal-cancel]').addEventListener('click', () => root.innerHTML = ''); root.querySelector('[data-modal-confirm]').addEventListener('click', async () => { root.innerHTML = ''; await onConfirm(); }); }

  function resetScrollPosition() { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }
  async function render() { if (state.route.page === 'detail' && location.hash === '#list') captureDetailTransition(state.route.id); routeFromHash(); if (state.route.page === 'detail') { resetScrollPosition(); renderDetail(state.route.id); } else if (state.route.page === 'edit') renderEdit(state.route.id || 'new'); else if (state.route.page === 'backup') renderBackup(); else if (state.route.page === 'discord-format') renderDiscordFormat(); else if (state.route.page === 'settings') renderSettings(); else renderList(); }
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', applyTheme);
  (async () => { try { await openDb(); await refreshData(); await render(); } catch (error) { console.error(error); document.querySelector('#app').innerHTML = '<main class="page"><div class="empty-state"><h2>アプリを起動できませんでした</h2><p>ブラウザのIndexedDBが利用できる環境で再読み込みしてください。</p></div></main>'; } })();
  function setupCampaignFields() { const form = document.querySelector('#scenario-form'); if (!form || document.querySelector('#campaign-fields')) return; const scenario = state.route.id && state.route.id !== 'new' ? detail(state.route.id) : null; const data = scenario ? JSON.parse(JSON.stringify(scenario)) : blankData(); const episodes = array(data.campaign?.episodes); const section = document.createElement('section'); section.id = 'campaign-fields'; section.className = 'section-card campaign-fields'; section.innerHTML = `<h2 class="section-heading">シナリオ形式</h2><div class="field"><label>形式</label><div class="radio-group"><label class="radio-label"><input type="radio" name="scenarioType" value="normal" ${data.basic?.scenarioType !== 'campaign' ? 'checked' : ''}>通常</label><label class="radio-label"><input type="radio" name="scenarioType" value="campaign" ${data.basic?.scenarioType === 'campaign' ? 'checked' : ''}>キャンペーン</label></div></div><div id="campaign-editor" class="campaign-editor"><div class="campaign-toolbar"><label for="episode-count">話数</label><input id="episode-count" name="episodeCount" type="number" min="1" value="${data.campaign?.episodeCount || episodes.length || 1}"><button type="button" class="btn small" data-action="add-episode">話を追加</button></div><div id="episode-list"></div></div>`; form.querySelector('.section-card')?.insertAdjacentElement('afterend', section); const editor = section.querySelector('#campaign-editor'); const count = section.querySelector('#episode-count'); const list = section.querySelector('#episode-list'); const renderEpisodes = () => { const total = Math.max(1, Number(count.value) || 1); count.value = total; list.innerHTML = Array.from({ length: total }, (_, index) => { const ep = episodes[index] || {}; const timeType = ep.timeType || 'fixed'; return `<article class="episode-card"><h3><span>第${index + 1}話</span>${total > 1 ? '<button type="button" class="btn small danger episode-remove" data-action="remove-episode">削除</button>' : ''}</h3><input type="hidden" name="episode-number" value="${index + 1}"><div class="episode-grid"><div class="field"><label>話タイトル</label><input name="episode-title" value="${escAttr(ep.title || '')}" placeholder="話のタイトル"></div><div class="field"><label>時間形式</label><select name="episode-time-type"><option value="fixed" ${timeType === 'fixed' ? 'selected' : ''}>固定</option><option value="range" ${timeType === 'range' ? 'selected' : ''}>範囲</option><option value="free" ${timeType === 'free' ? 'selected' : ''}>自由入力</option></select></div><div class="field"><label>時間</label><div class="episode-time"><input name="episode-time-value" type="number" min="0" step="any" value="${escAttr(ep.timeValue || '')}" placeholder="数値"><select name="episode-time-unit"><option value="分" ${ep.timeUnit === '分' ? 'selected' : ''}>分</option><option value="時間" ${ep.timeUnit !== '分' ? 'selected' : ''}>時間</option></select></div><input class="episode-time-free" name="episode-time-free" value="${escAttr(ep.timeFree || '')}" placeholder="例：約2〜3時間"></div></div><div class="field"><label>概要</label><textarea name="episode-summary" placeholder="この話の概要">${escapeHtml(ep.summary || '')}</textarea></div><div class="episode-grid"><div class="field"><label>進行状況</label><select name="episode-status"><option value="未プレイ" ${ep.status !== 'プレイ済み' ? 'selected' : ''}>未プレイ</option><option value="プレイ済み" ${ep.status === 'プレイ済み' ? 'selected' : ''}>プレイ済み</option></select></div><div class="field"><label>プレイ日</label><input name="episode-play-date" type="date" value="${escAttr(ep.playDate || '')}"></div></div></article>`; }).join(''); list.querySelectorAll('.episode-card').forEach(card => { const type = card.querySelector('[name="episode-time-type"]'); const sync = () => { const free = card.querySelector('.episode-time-free'); const normal = card.querySelector('.episode-time'); const isFree = type.value === 'free'; free.hidden = !isFree; normal.hidden = isFree; }; type.addEventListener('change', sync); sync(); }); list.querySelectorAll('[data-action="remove-episode"]').forEach(button => button.addEventListener('click', () => { const card = button.closest('.episode-card'); if (!card || list.children.length <= 1) return; card.remove(); count.value = list.children.length; list.querySelectorAll('.episode-card').forEach((item, index) => { item.querySelector('h3 span').textContent = `第${index + 1}話`; item.querySelector('[name="episode-number"]').value = index + 1; }); list.querySelectorAll('[data-action="remove-episode"]').forEach(removeButton => { removeButton.hidden = list.children.length <= 1; }); })); }; const syncVisibility = () => { const isCampaign = section.querySelector('input[name="scenarioType"]:checked')?.value === 'campaign'; editor.hidden = !isCampaign; }; section.querySelectorAll('input[name="scenarioType"]').forEach(input => input.addEventListener('change', syncVisibility)); count.addEventListener('change', renderEpisodes); section.querySelector('[data-action="add-episode"]').addEventListener('click', () => { count.value = Number(count.value || 0) + 1; renderEpisodes(); }); renderEpisodes(); syncVisibility(); }
  function addKpLessOption() { const group = document.querySelector('#campaign-fields .radio-group'); const editor = document.querySelector('#campaign-editor'); if (!group || !editor) return; const label = document.createElement('label'); label.className = 'radio-label'; label.innerHTML = '<input type="radio" name="scenarioType" value="kp-less">KPレス'; group.appendChild(label); const scenario = state.route.id && state.route.id !== 'new' ? detail(state.route.id) : null; if (scenario?.basic?.scenarioType === 'kp-less') { group.querySelectorAll('input[name="scenarioType"]').forEach(input => { input.checked = input.value === 'kp-less'; }); } const sync = () => { editor.hidden = document.querySelector('input[name="scenarioType"]:checked')?.value !== 'campaign'; }; label.querySelector('input').addEventListener('change', sync); sync(); }
  function readForm() { const form = document.querySelector('#scenario-form'); const fd = new FormData(form); const value = name => fd.get(name)?.toString() || ''; const timed = key => { const number = value(key); const unit = value(`${key}Unit`) || '時間'; return number ? `${number}${unit}` : ''; }; const type = value('scenarioType') || 'normal'; const episodeTitles = fd.getAll('episode-title'); const episodes = type === 'campaign' ? episodeTitles.map((title, index) => ({ number: index + 1, title: title.trim(), timeType: fd.getAll('episode-time-type')[index] || 'fixed', timeValue: fd.getAll('episode-time-value')[index] || '', timeUnit: fd.getAll('episode-time-unit')[index] || '時間', timeFree: fd.getAll('episode-time-free')[index] || '', summary: fd.getAll('episode-summary')[index]?.trim() || '', status: fd.getAll('episode-status')[index] || '未プレイ', playDate: fd.getAll('episode-play-date')[index] || '' })) : []; return { basic: { title: value('title').trim(), system: value('system'), version: value('version'), author: value('author').trim(), scenarioType: type, countType: value('countType') || 'fixed', fixedCount: value('fixedCount'), minCount: value('minCount'), maxCount: value('maxCount'), freeCount: value('freeCount'), timeType: value('timeType') || 'fixed', fixedTime: timed('fixedTime'), fixedTimeValue: value('fixedTime'), fixedTimeUnit: value('fixedTimeUnit') || '時間', minTime: timed('minTime'), minTimeValue: value('minTime'), minTimeUnit: value('minTimeUnit') || '時間', maxTime: timed('maxTime'), maxTimeValue: value('maxTime'), maxTimeUnit: value('maxTimeUnit') || '時間', freeTime: value('freeTime'), stage: value('stage').trim() }, campaign: { episodeCount: episodes.length, episodes }, scenario: { recommendedSkills: value('recommendedSkills').trim(), secondarySkills: value('secondarySkills').trim(), notRecommended: value('notRecommended').trim(), lostRate: value('lostRate'), lostRateNote: value('lostRateNote').trim(), hoType: value('hoType'), hoContent: value('hoContent').trim(), trends: fd.getAll('trends'), combat: value('combat'), notes: value('notes').trim() }, trailer: { text: value('trailerText').trim(), images: state.editImages.slice() }, personal: { url: value('url').trim(), kpStatus: value('kpStatus'), playStatus: value('playStatus'), memo: value('memo').trim() } }; }
  function adjustCampaignLayout() { const form = document.querySelector('#scenario-form'); const campaign = document.querySelector('#campaign-fields'); const basicGrid = form?.querySelector('.section-card .form-grid'); if (!form || !campaign || !basicGrid) return; const typeField = campaign.querySelector('.field'); const infoColumn = basicGrid.children[0]; const versionField = infoColumn?.querySelector('#version')?.closest('.field'); typeField?.classList.add('scenario-type-field'); typeField?.querySelector('.radio-group')?.classList.add('scenario-type-tabs'); if (typeField && versionField) versionField.insertAdjacentElement('afterend', typeField); campaign.querySelector('.section-heading')?.remove(); const timeField = basicGrid.children[2]; if (!timeField) return; basicGrid.insertAdjacentElement('afterend', campaign); const normalTimeFields = [...timeField.children]; const editor = campaign.querySelector('#campaign-editor'); const toolbar = campaign.querySelector('.campaign-toolbar'); const total = document.createElement('div'); total.id = 'campaign-total-time'; total.className = 'campaign-total-time'; total.textContent = '合計時間：未入力'; toolbar?.appendChild(total); const updateTotal = () => { const values = [...(editor?.querySelectorAll('[name="episode-time-value"]') || [])]; const types = [...(editor?.querySelectorAll('[name="episode-time-type"]') || [])]; if (!values.length || types.some(type => type.value === 'free') || values.some(input => !input.value)) { total.textContent = '合計時間：未入力'; return; } const minutes = values.reduce((sum, input, index) => sum + Number(input.value) * (editor.querySelectorAll('[name="episode-time-unit"]')[index]?.value === '時間' ? 60 : 1), 0); total.textContent = `合計時間：約${minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`}`; }; editor?.addEventListener('input', updateTotal); editor?.addEventListener('change', updateTotal); const sync = () => { const isCampaign = form.querySelector('input[name="scenarioType"]:checked')?.value === 'campaign'; normalTimeFields.forEach(field => { field.hidden = isCampaign; field.style.display = isCampaign ? 'none' : ''; }); if (editor) editor.hidden = !isCampaign; updateTotal(); }; form.querySelectorAll('input[name="scenarioType"]').forEach(input => input.addEventListener('change', sync)); sync(); }
  // Keep draft reopening and draft-to-scenario migration explicit in the final event handlers.
  function bindEdit(id, scenario) { const form = document.querySelector('#scenario-form'); ['countType', 'timeType'].forEach(name => document.querySelectorAll(`input[name="${name}"]`).forEach(el => el.addEventListener('change', () => { const prefix = name === 'countType' ? 'count' : 'time'; document.querySelectorAll(`[data-condition^="${prefix}-"]`).forEach(block => block.classList.toggle('visible', block.dataset.condition.endsWith(el.value))); }))); document.querySelector('#system')?.addEventListener('change', e => { document.querySelector('#version').innerHTML = optionList(currentVersions(e.target.value), '', false); }); const imageInput = document.querySelector('#trailer-images'); const imageUpload = imageInput?.closest('.image-upload'); imageInput?.addEventListener('change', e => addTrailerImages(e.target.files, imageInput)); if (imageUpload) { ['dragenter', 'dragover'].forEach(type => imageUpload.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); imageUpload.classList.add('dragover'); })); ['dragleave', 'drop'].forEach(type => imageUpload.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); imageUpload.classList.remove('dragover'); })); imageUpload.addEventListener('drop', event => addTrailerImages(event.dataTransfer?.files)); } renderPreviews(); document.querySelector('[data-action="cancel"]').addEventListener('click', () => go(scenario ? 'detail' : 'list', scenario?.id || '')); document.querySelector('[data-action="save-draft"]').addEventListener('click', saveDraft); document.querySelector('[data-action="load-draft"]')?.addEventListener('click', () => { const draft = state.drafts.find(d => d.id === document.querySelector('#draft-picker').value); if (draft) loadDraft(draft); else toast('下書きを選択してください', true); }); document.querySelector('[data-action="delete-draft"]')?.addEventListener('click', async () => { const selected = document.querySelector('#draft-picker').value; if (!selected) return toast('削除する下書きを選択してください', true); await remove('drafts', selected); if (state.activeDraftId === selected) state.activeDraftId = null; await refreshData(); toast('下書きを削除しました'); renderEdit(id); }); form.addEventListener('submit', async e => { e.preventDefault(); const data = readForm(); if (!data.basic.title) { toast('タイトルを入力してください', true); document.querySelector('#title').focus(); return; } const record = { id: scenario?.id || uid('scenario'), ...data, createdAt: scenario?.createdAt || now(), updatedAt: now() }; await put('scenarios', record); if (state.activeDraftId) { await remove('drafts', state.activeDraftId); state.activeDraftId = null; } await refreshData(); toast(scenario ? 'シナリオを更新しました' : 'シナリオを登録しました'); if (state.settings.promptBackup) toast('保存後にバックアップ画面からバックアップを作成できます'); go('detail', record.id); }); }
  function loadDraft(draft) { const data = draft.data; state.activeDraftId = draft.id; state.editImages = array(data.trailer?.images).slice(); const target = state.route.id && state.route.id !== 'new' ? state.route.id : 'new'; renderEdit(target); setTimeout(() => { const form = document.querySelector('#scenario-form'); Object.entries({ ...data.basic, ...data.scenario, ...data.personal, trailerText: data.trailer.text, recommendedSkills: textValue(data.scenario.recommendedSkills), secondarySkills: textValue(data.scenario.secondarySkills) }).forEach(([key, val]) => { const el = form.elements[key]; if (!el) return; if (el instanceof RadioNodeList) [...el].forEach(r => { r.checked = r.value === val; }); else el.value = val; }); form.querySelectorAll('input[name="trends"]').forEach(ch => ch.checked = array(data.scenario.trends).includes(ch.value)); document.querySelectorAll('input[name="countType"], input[name="timeType"]').forEach(el => el.dispatchEvent(new Event('change'))); const picker = document.querySelector('#draft-picker'); if (picker) picker.value = draft.id; renderPreviews(); toast('下書きを開きました'); }, 0); }
  function setupHoFields() { const typeField = document.querySelector('#hoType')?.closest('.field'); const contentField = document.querySelector('#hoContent')?.closest('.field'); if (!typeField || !contentField || document.querySelector('#ho-items')) return; if (state.route.id === 'new') state.editHoItems = [{ type: '', content: '' }]; state.editHoType = typeField.querySelector('select')?.value || state.editHoType || ''; const host = document.createElement('div'); host.id = 'ho-items'; host.className = 'ho-items'; host.innerHTML = `<div class="field ho-type-field"><label for="ho-global-type">HO形式</label><select id="ho-global-type" name="ho-global-type">${optionList(MASTER.hoTypes, state.editHoType, false)}</select></div><div class="ho-items-list"></div><button type="button" class="btn small soft" data-action="add-ho">＋ HOを追加</button>`; typeField.replaceWith(host); contentField.remove(); const list = host.querySelector('.ho-items-list'); const syncItems = () => { state.editHoItems = state.editHoItems.map((item, index) => ({ ...item, content: list.querySelectorAll('[name="ho-content"]')[index]?.value ?? item.content })); }; const render = () => { list.innerHTML = state.editHoItems.map((item, index) => `<div class="ho-item"><div class="ho-item-header"><span>HO</span>${state.editHoItems.length > 1 ? `<button type="button" class="btn small danger" data-remove-ho="${index}">削除</button>` : ''}</div><div class="field"><label>内容</label><textarea class="ho-content" name="ho-content" placeholder="HOの内容を入力">${escapeHtml(item.content)}</textarea></div></div>`).join(''); list.querySelectorAll('[data-remove-ho]').forEach(button => button.addEventListener('click', () => { syncItems(); state.editHoItems.splice(Number(button.dataset.removeHo), 1); render(); })); }; host.querySelector('[data-action="add-ho"]').addEventListener('click', () => { syncItems(); state.editHoItems.push({ type: state.editHoType, content: '' }); render(); }); render(); }
  function repairHoTypeField() { const select = document.querySelector('[name="ho-global-type"]'); if (select && state.editHoType) select.value = state.editHoType; }
  function syncHoFields() { const host = document.querySelector('#ho-items'); if (!host) return; const make = () => { let type = host.querySelector('input[name="hoType"]'); let content = host.querySelector('input[name="hoContent"]'); if (!type) { host.insertAdjacentHTML('afterbegin', '<input type="hidden" name="hoType"><input type="hidden" name="hoContent">'); type = host.querySelector('input[name="hoType"]'); content = host.querySelector('input[name="hoContent"]'); } type.value = host.querySelector('[name="ho-global-type"]')?.value || ''; content.value = [...host.querySelectorAll('[name="ho-content"]')].map(input => input.value).join('\u001e'); }; host.addEventListener('input', make); host.addEventListener('change', make); host.addEventListener('click', () => setTimeout(make, 0)); make(); }
  function hoTypeLabel(value) { return String(value || '').split('\u001f').filter(Boolean).join(' / '); }
  function transitionName(id) { return `scenario-image-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`; }
  function captureDetailTransition(id) {
    const image = document.querySelector('.hero-images img, .hero-images .placeholder');
    const rect = image?.getBoundingClientRect();
    if (!rect || !id) return;
    state.pendingScenarioTransition = { id, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  }
  function animateScenarioTransition(id, target = document.querySelector('.hero-images img, .hero-images .placeholder')) {
    const pending = state.pendingScenarioTransition;
    if (!pending || pending.id !== id) { state.pendingScenarioTransition = null; return; }
    if (!target) { state.pendingScenarioTransition = null; return; }
    const targetRect = target.getBoundingClientRect();
    const source = target.cloneNode(true);
    source.removeAttribute('style');
    target.style.opacity = '0';
    Object.assign(source.style, {
      position: 'fixed', left: `${pending.rect.left}px`, top: `${pending.rect.top}px`, width: `${pending.rect.width}px`, height: `${pending.rect.height}px`,
      margin: '0', zIndex: '1000', pointerEvents: 'none', objectFit: 'cover', borderRadius: '14px', transition: 'left .68s cubic-bezier(.16,1,.3,1), top .68s cubic-bezier(.16,1,.3,1), width .68s cubic-bezier(.16,1,.3,1), height .68s cubic-bezier(.16,1,.3,1), border-radius .68s cubic-bezier(.16,1,.3,1)'
    });
    document.body.appendChild(source);
    requestAnimationFrame(() => Object.assign(source.style, { left: `${targetRect.left}px`, top: `${targetRect.top}px`, width: `${targetRect.width}px`, height: `${targetRect.height}px`, borderRadius: '0' }));
    setTimeout(() => { source.remove(); target.style.opacity = ''; }, 760);
    state.pendingScenarioTransition = null;
  }
  function scenarioCard(s) { const b = s.basic || {}, sc = s.scenario || {}, p = s.personal || {}, image = array(s.trailer?.images)[0], favorite = Boolean(s.favorite), imageTransition = transitionName(s.id); return `<article class="scenario-card" data-id="${escAttr(s.id)}"><div class="card-image ${image ? '' : 'placeholder'}">${image ? `<img class="card-image" src="${escAttr(image.src)}" style="view-transition-name: ${imageTransition}" alt="${escAttr(b.title)}のトレーラー画像">` : '✦'}</div><div class="card-body"><div class="card-title-row"><h2 class="card-title">${display(b.title)}</h2><button class="favorite ${favorite ? 'active' : ''}" type="button" data-action="favorite" aria-label="${favorite ? 'お気に入りから外す' : 'お気に入りに追加'}" aria-pressed="${favorite}">${favorite ? '★' : '☆'}</button></div><div class="card-system">${display(b.system)}${b.version ? ` / ${escapeHtml(b.version)}` : ''}</div><div class="card-author">作者名：${display(b.author)}</div><div class="card-facts"><span>${escapeHtml(personLabel(b))}</span><span>|</span><span>${escapeHtml(timeLabel(b))}</span></div><div class="card-recommended">推奨技能：${display(textValue(sc.recommendedSkills))}</div><div class="tags">${sc.hoType ? `<span class="tag">HO形式：${escapeHtml(hoTypeLabel(sc.hoType))}</span>` : ''}${array(sc.trends).slice(0, 3).map((x, index) => tagMarkup(x, index)).join('')}</div><div class="card-status">ロスト率：${display(sc.lostRate)}　|　${escapeHtml(p.kpStatus || '未KP')}・${escapeHtml(p.playStatus || '未通過')}</div></div></article>`; }
  function normalizeHoItems(scenario = {}) { if (Array.isArray(scenario.hoItems) && scenario.hoItems.length) return scenario.hoItems.map(item => ({ type: item.type || '', content: item.content || '' })); const types = String(scenario.hoType || '').split('\u001f'); const contents = String(scenario.hoContent || '').split('\u001e'); const total = Math.max(types.length, contents.length); return total && (types.some(Boolean) || contents.some(Boolean)) ? Array.from({ length: total }, (_, index) => ({ type: types[index] || '', content: contents[index] || '' })) : [{ type: '', content: '' }]; }
  const detailRender = renderDetail;
  renderDetail = id => {
    detailRender(id);
    const scenario = state.scenarios.find(item => item.id === id);
    if (!scenario) return;
    const detailActions = document.querySelector('.detail-actions');
    if (detailActions) {
      detailActions.insertAdjacentHTML('afterbegin', `<button class="favorite detail-favorite ${scenario.favorite ? 'active' : ''}" type="button" data-action="favorite" aria-label="${scenario.favorite ? 'お気に入りから外す' : 'お気に入りに追加'}" aria-pressed="${Boolean(scenario.favorite)}">${scenario.favorite ? '★' : '☆'}</button>`);
      detailActions.querySelector('[data-action="favorite"]')?.addEventListener('click', () => toggleFavorite(id));
    }
    const heroImage = document.querySelector('.hero-images img, .hero-images .placeholder');
    if (heroImage) heroImage.style.viewTransitionName = transitionName(id);
    const basic = scenario.basic || {};
    const basicSection = [...document.querySelectorAll('.section-card')].find(section => section.querySelector('.section-heading')?.textContent?.trim() === '\u57fa\u672c\u60c5\u5831');
    const basicColumns = basicSection?.querySelector('.data-grid')?.children || [];
    const countColumn = basicColumns[1];
    const timeColumn = basicColumns[2];
    const removeInactive = (column, type, activeIndexes) => {
      if (!column) return;
      [...column.children].forEach((item, index) => {
        if (index >= 2 && !activeIndexes[type]?.includes(index)) item.remove();
      });
    };
    removeInactive(countColumn, basic.countType || 'fixed', { fixed: [2], range: [3, 4], free: [5] });
    removeInactive(timeColumn, basic.timeType || 'fixed', { fixed: [2], range: [3, 4], free: [5] });
    if (basic.scenarioType !== 'campaign') {
      [countColumn, timeColumn].forEach(column => [...(column?.children || [])].slice(1).forEach(item => item.remove()));
      return;
    }
    const episodes = Array.isArray(scenario.campaign?.episodes) ? scenario.campaign.episodes : [];
    if (!timeColumn) return;
    const episodeTime = episode => episode.timeType === 'free' ? (episode.timeFree || '\u672a\u8a2d\u5b9a') : episode.timeValue ? String(episode.timeValue) + (episode.timeUnit || '\u6642\u9593') : '\u672a\u8a2d\u5b9a';
    const minutes = episodes.reduce((sum, episode) => {
      if (episode.timeType === 'free' || !episode.timeValue) return NaN;
      return sum + Number(episode.timeValue) * (episode.timeUnit === '\u5206' ? 1 : 60);
    }, 0);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    const total = Number.isFinite(minutes) ? (hours ? hours + '\u6642\u9593' : '') + (remainder ? remainder + '\u5206' : '') || '0\u5206' : '\u672a\u5165\u529b';
    timeColumn.innerHTML = '<div class="data-item"><div class="data-label">\u7dcf\u5408\u6642\u9593</div><div class="data-value">' + escapeHtml(total) + '</div></div>' + episodes.map((episode, index) => '<div class="data-item"><div class="data-label">\u7b2c' + (index + 1) + '\u8a71\u306e\u6642\u9593</div><div class="data-value">' + escapeHtml(episodeTime(episode)) + '</div></div>').join('');
  };
  const positionedDetailRender = renderDetail;
  renderDetail = id => {
    positionedDetailRender(id);
    const scenario = state.scenarios.find(item => item.id === id);
    if (!scenario) return;
    const images = array(scenario.trailer?.images);
    document.querySelectorAll('.detail-carousel').forEach(carousel => carousel.querySelectorAll('.carousel-slide').forEach((element, index) => {
      const image = images[index];
      if (image) { element.src = image.src; element.style.cssText = `${element.style.cssText};${imagePositionStyle(image)};${imageZoomStyle(image)}`; }
    }));
  };
  const carouselDetailRender = renderDetail;
  renderDetail = id => {
    carouselDetailRender(id);
    animateScenarioTransition(id);
    document.querySelectorAll('.detail-carousel').forEach(carousel => {
      const track = carousel.querySelector('.carousel-track');
      const slides = [...carousel.querySelectorAll('.carousel-slide')];
      if (!track || slides.length < 2) return;
      const firstClone = slides[0].cloneNode(true);
      const lastClone = slides[slides.length - 1].cloneNode(true);
      firstClone.classList.remove('active');
      lastClone.classList.remove('active');
      firstClone.setAttribute('aria-hidden', 'true');
      lastClone.setAttribute('aria-hidden', 'true');
      track.insertBefore(lastClone, slides[0]);
      track.appendChild(firstClone);
      const allSlides = [lastClone, ...slides, firstClone];
      const slideCount = slides.length;
      let current = 0;
      let resetting = false;
      let settleTimer = null;
      const counter = carousel.querySelector('.carousel-counter');
      const sync = () => {
        allSlides.forEach((slide, slideIndex) => {
          const active = slideIndex === current + 1;
          slide.classList.toggle('active', active);
          slide.setAttribute('aria-hidden', String(!active));
        });
        if (counter) counter.textContent = `${current + 1} / ${slideCount}`;
      };
      const show = (index, behavior = 'smooth') => {
        const targetIndex = index < 0 ? 0 : index >= slideCount ? slideCount + 1 : index + 1;
        current = (index + slideCount) % slideCount;
        sync();
        const left = targetIndex * track.clientWidth;
        if (track.scrollTo) track.scrollTo({ left, behavior });
        else track.scrollLeft = left;
      };
      track.scrollLeft = track.clientWidth;
      sync();
      const normalizeLoopPosition = () => {
        if (resetting) return;
        const width = track.clientWidth;
        if (!width) return;
        const rawIndex = Math.round(track.scrollLeft / width);
        if (rawIndex !== 0 && rawIndex !== slideCount + 1) return;
        resetting = true;
        track.style.scrollSnapType = 'none';
        current = rawIndex === 0 ? slideCount - 1 : 0;
        track.scrollLeft = current === 0 ? width : slideCount * width;
        sync();
        requestAnimationFrame(() => {
          track.style.scrollSnapType = 'x mandatory';
          resetting = false;
        });
      };
      carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', () => show(current - 1));
      carousel.querySelector('[data-carousel-next]')?.addEventListener('click', () => show(current + 1));
      carousel.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
      });
      track?.addEventListener('scroll', () => {
        if (resetting) return;
        const width = track.clientWidth;
        if (!width) return;
        const rawIndex = Math.round(track.scrollLeft / width);
        if (rawIndex === 0) {
          current = slideCount - 1;
          sync();
          clearTimeout(settleTimer);
          settleTimer = setTimeout(normalizeLoopPosition, 140);
        } else if (rawIndex === slideCount + 1) {
          current = 0;
          sync();
          clearTimeout(settleTimer);
          settleTimer = setTimeout(normalizeLoopPosition, 140);
        } else if (rawIndex >= 1 && rawIndex <= slideCount) {
          clearTimeout(settleTimer);
          const next = rawIndex - 1;
          if (next !== current) { current = next; sync(); }
        }
      }, { passive: true });
    });
  };
  const listRender = renderList;
  renderList = () => {
    listRender();
    state.scenarios.forEach(scenario => {
      const image = array(scenario.trailer?.images)[0];
      const card = [...document.querySelectorAll('.scenario-card')].find(element => element.dataset.id === scenario.id);
      const element = card?.querySelector('img.card-image');
      if (image && element) { element.src = image.src; element.style.cssText = `${element.style.cssText};${imagePositionStyle(image)};${imageZoomStyle(image)}`; }
    });
    const pending = state.pendingScenarioTransition;
    if (pending) {
      const card = [...document.querySelectorAll('.scenario-card')].find(element => element.dataset.id === pending.id);
      animateScenarioTransition(pending.id, card?.querySelector('img.card-image') || card?.querySelector('.card-image'));
    }
  };
  renderPreviews = () => {
    const root = document.querySelector('#image-previews');
    if (!root) return;
    state.editImages = state.editImages.map(normalizeTrailerImage).filter(Boolean);
    root.innerHTML = state.editImages.length ? `<span class="image-preview-helper">画像をドラッグして表示範囲を調整できます。ホイールまたはピンチでズームできます。</span>${state.editImages.map((image, index) => `<div class="image-preview"><img src="${escAttr(image.src)}" style="${imagePositionStyle(image)};${imageZoomStyle(image)}" data-image-index="${index}" alt="選択したトレーラー画像 ${index + 1}"><span class="image-zoom-label" data-zoom-label="${index}">${imageZoom(image).toFixed(1)}x</span><button type="button" data-remove-image="${index}" aria-label="画像を削除">×</button></div>`).join('')}` : '';
    root.querySelectorAll('[data-remove-image]').forEach(button => button.addEventListener('click', () => { state.editImages.splice(Number(button.dataset.removeImage), 1); renderPreviews(); }));
    root.querySelectorAll('[data-image-index]').forEach(imageElement => {
      imageElement.addEventListener('pointerdown', event => {
        event.preventDefault();
        imageElement.setPointerCapture(event.pointerId);
        imageElement.classList.add('dragging');
        const index = Number(imageElement.dataset.imageIndex);
        const image = state.editImages[index];
        const start = { x: event.clientX, y: event.clientY, position: { ...image.position } };
        const move = moveEvent => {
          const viewport = imageElement.parentElement;
          if (imageZoom(image) <= 1) return;
          image.position.x = clamp(start.position.x - ((moveEvent.clientX - start.x) / viewport.clientWidth) * 100, 0, 100);
          image.position.y = clamp(start.position.y - ((moveEvent.clientY - start.y) / viewport.clientHeight) * 100, 0, 100);
          imageElement.style.cssText = `${imagePositionStyle(image)};${imageZoomStyle(image)}`;
        };
        const finish = () => { imageElement.classList.remove('dragging'); imageElement.removeEventListener('pointermove', move); imageElement.removeEventListener('pointerup', finish); imageElement.removeEventListener('pointercancel', finish); };
        imageElement.addEventListener('pointermove', move);
        imageElement.addEventListener('pointerup', finish);
        imageElement.addEventListener('pointercancel', finish);
      });
      imageElement.addEventListener('wheel', event => {
        event.preventDefault();
        const image = state.editImages[Number(imageElement.dataset.imageIndex)];
        if (!image) return;
        image.zoom = clamp(imageZoom(image) + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3);
        imageElement.style.cssText = `${imagePositionStyle(image)};${imageZoomStyle(image)}`;
        const label = root.querySelector(`[data-zoom-label="${imageElement.dataset.imageIndex}"]`);
        if (label) label.textContent = `${imageZoom(image).toFixed(1)}x`;
      }, { passive: false });
    });
  };
  function setupReadingFields() {
    const form = document.querySelector('#scenario-form');
    if (!form) return;
    [['title', 'titleReading', 'タイトルの読み方', '例：しなりおのたいとる'], ['author', 'authorReading', '作者名の読み方', '例：やまだ たろう']].forEach(([sourceName, readingName, labelText, placeholder]) => {
      const source = form.elements[sourceName];
      if (!source || form.elements[readingName]) return;
      const field = document.createElement('div');
      field.className = 'field';
      field.innerHTML = `<label for="${readingName}">${labelText}</label><input id="${readingName}" name="${readingName}" placeholder="${placeholder}">`;
      source.closest('.field')?.insertAdjacentElement('afterend', field);
      const scenario = state.route.id && state.route.id !== 'new' ? detail(state.route.id) : null;
      field.querySelector('input').value = scenario?.basic?.[readingName] || '';
    });
  }
  const baseReadForm = readForm;
  readForm = () => {
    const data = baseReadForm();
    const form = document.querySelector('#scenario-form');
    data.basic.titleReading = form?.elements.titleReading?.value.trim() || '';
    data.basic.authorReading = form?.elements.authorReading?.value.trim() || '';
    return data;
  };
  const baseBindEdit = bindEdit;
  bindEdit = (...args) => { baseBindEdit(...args); setupReadingFields(); };
})();
