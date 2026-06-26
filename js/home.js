const WEEKDAY_LABEL = ['', '月', '火', '水', '木', '金', '土', '日'];

let _homeVideoShownId = null;

// よくやるメニュー定義（id は record.frequent のキーと一致させる）
const FREQUENT_ITEMS = [
  { id: 'walking', label: 'ウォーキング', type: 'time'   },
  { id: 'plank',   label: 'プランク',     type: 'minsec' },
  { id: 'squats',  label: 'スクワット',   type: 'repsets'},
];

// ── 内部：よくやるメニュー1項目のHTML ──
function buildFrequentItemHTML(item, freq) {
  const f = freq?.[item.id] || {};
  if (item.type === 'time') {
    return `
      <div class="freq-item">
        <span class="freq-label">${escHtml(item.label)}</span>
        <div class="freq-inputs">
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="hours"
            min="0" inputmode="numeric" value="${f.hours || ''}">
          <span class="freq-unit">時間</span>
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="minutes"
            min="0" max="59" inputmode="numeric" value="${f.minutes || ''}">
          <span class="freq-unit">分</span>
        </div>
      </div>`;
  }
  if (item.type === 'minsec') {
    return `
      <div class="freq-item">
        <span class="freq-label">${escHtml(item.label)}</span>
        <div class="freq-inputs">
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="minutes"
            min="0" inputmode="numeric" value="${f.minutes || ''}">
          <span class="freq-unit">分</span>
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="seconds"
            min="0" max="59" inputmode="numeric" value="${f.seconds || ''}">
          <span class="freq-unit">秒</span>
        </div>
      </div>`;
  }
  if (item.type === 'repsets') {
    return `
      <div class="freq-item">
        <span class="freq-label">${escHtml(item.label)}</span>
        <div class="freq-inputs">
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="reps"
            min="0" inputmode="numeric" value="${f.reps || ''}">
          <span class="freq-unit">回</span>
          <input type="number" class="freq-input"
            data-freq-id="${item.id}" data-freq-field="sets"
            min="0" inputmode="numeric" value="${f.sets || ''}">
          <span class="freq-unit">セット</span>
        </div>
      </div>`;
  }
  return '';
}

// ── 共通：記録フォームHTML生成 ────────────────────────────────
// history.js の編集モードからも呼び出す。
function buildRecordFormHTML(menuItems, existingRecord) {
  const existingItems = existingRecord?.items || [];
  const checkboxesHTML = menuItems.length > 0
    ? `<div class="record-items">${
        menuItems.map(item => {
          const done = existingItems.find(r => r.name === item.name)?.done ?? false;
          return `
            <label class="record-check-label">
              <input type="checkbox" class="record-item-check"
                data-name="${escHtml(item.name)}"${done ? ' checked' : ''}>
              <span>${escHtml(item.name)}</span>
            </label>`;
        }).join('')
      }</div>`
    : '';

  const freq = existingRecord?.frequent;
  const frequentHTML = `
    <div class="freq-section">
      <div class="freq-heading">よくやるメニュー</div>
      ${FREQUENT_ITEMS.map(item => buildFrequentItemHTML(item, freq)).join('')}
    </div>`;

  return `${checkboxesHTML}
    <div class="record-form">
      <label class="form-label">体調メモ</label>
      <textarea class="rf-note" rows="2"
        placeholder="体調・気づきなど...">${escHtml(existingRecord?.note || '')}</textarea>
      <label class="form-label">追加でやったこと</label>
      <textarea class="rf-extra" rows="2"
        placeholder="メニュー外の運動など...">${escHtml(existingRecord?.extra || '')}</textarea>
    </div>
    ${frequentHTML}`;
}

// ── 共通：記録を指定日付でupsert ────────────────────────────
// containerEl 内の .record-item-check / .rf-note / .rf-extra / .freq-input を読んで保存。
async function saveRecordForDate(dk, containerEl, weekNumber) {
  const checks = [...containerEl.querySelectorAll('.record-item-check')];
  const items  = checks.map(cb => ({ name: cb.dataset.name, done: cb.checked }));
  const note   = containerEl.querySelector('.rf-note')?.value  ?? '';
  const extra  = containerEl.querySelector('.rf-extra')?.value ?? '';

  const frequent = {};
  FREQUENT_ITEMS.forEach(item => {
    const inputs = [...containerEl.querySelectorAll(`.freq-input[data-freq-id="${item.id}"]`)];
    const vals   = {};
    inputs.forEach(inp => {
      let v = parseInt(inp.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      vals[inp.dataset.freqField] = v;
    });
    frequent[item.id] = vals;
  });

  const existing = await dbGetAllByIndex('records', 'date', dk);
  const record   = { date: dk, weekNumber, items, note, extra, frequent };
  if (existing.length > 0) record.id = existing[0].id;
  return dbPut('records', record);
}

async function renderHome() {
  _homeVideoShownId = null;

  const today = new Date();
  const wd    = weekdayJp(today);
  const dk    = dateKey(today);
  const dateStr =
    `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${WEEKDAY_LABEL[wd]}）`;

  const el = document.getElementById('screen-home');

  // ── データ一括読込（HTML生成前） ──
  let planInfoHTML = '';
  let menuHTML     = '<p class="placeholder">まだメニューがありません</p>';
  let todayItems   = [];
  let todayGenre   = null;
  let weekNumber   = null;
  let existingRecord = null;
  let goalValue    = '';

  try {
    const activeSetting = await dbGet('settings', 'activePlanId');
    if (activeSetting) {
      const plan = await dbGet('plans', activeSetting.value);
      if (plan) {
        weekNumber = plan.weekNumber;
        planInfoHTML = `
          <div class="plan-info">
            <span class="plan-title">${escHtml(plan.title)}</span>
            <span class="plan-week">第 ${escHtml(plan.weekNumber)} 週</span>
          </div>
          ${plan.note ? `<p class="plan-note">${escHtml(plan.note)}</p>` : ''}`;

        const entry = (plan.days || []).find(d => d.day === wd);
        if (entry) {
          todayItems = entry.menu || [];
          todayGenre = entry.genre || null;
          const rows = todayItems.map(item => `
            <li class="menu-item">
              <span class="menu-name">${escHtml(item.name)}</span>
              <span class="menu-duration">${escHtml(item.duration)}</span>
            </li>`).join('');
          menuHTML = `
            <div class="day-header">
              ${todayGenre ? `<span class="day-genre">${escHtml(todayGenre)}</span>` : ''}
              ${entry.totalMinutes ? `<span class="day-total">計 ${escHtml(entry.totalMinutes)} 分</span>` : ''}
            </div>
            <ul class="menu-list">${rows}</ul>`;
        } else {
          menuHTML = '<p class="placeholder">今日は予定なし（休み）</p>';
        }
      }
    }

    const existing = await dbGetAllByIndex('records', 'date', dk);
    existingRecord = existing.length > 0 ? existing[0] : null;

    const savedGoal = await dbGet('settings', 'longTermGoal');
    if (savedGoal) goalValue = savedGoal.value;
  } catch (err) {
    console.error('データの読込に失敗しました:', err);
  }

  const videoSectionHTML = todayGenre
    ? `<section>
         <h2>今日の動画 <span class="genre-badge">${escHtml(todayGenre)}</span></h2>
         <div id="video-section-content">
           <p class="placeholder">読込中...</p>
         </div>
       </section>`
    : '';

  el.innerHTML = `
    <section>
      <p class="today-date">${dateStr}</p>
    </section>

    <section>
      <h2>今日のメニュー</h2>
      ${planInfoHTML}
      ${menuHTML}
    </section>

    <section>
      <h2>今月の登山</h2>
      <div id="hike-section-inner"><p class="placeholder">読込中...</p></div>
    </section>

    ${videoSectionHTML}

    <section class="home-record-section">
      <h2>今日の記録</h2>
      ${buildRecordFormHTML(todayItems, existingRecord)}
      <div class="form-btn-row">
        <button id="record-save-btn" class="btn-primary">記録を保存</button>
      </div>
      <p id="record-status" class="status-msg" aria-live="polite"></p>
    </section>

    <section>
      <h2>長期目標</h2>
      <div class="goal-form">
        <textarea id="goal-input" rows="3"
          placeholder="長期目標を入力...">${escHtml(goalValue)}</textarea>
        <button id="goal-save-btn" class="btn-primary">保存</button>
      </div>
      <p id="goal-status" class="status-msg" aria-live="polite"></p>
    </section>
  `;

  renderHikeSection(document.getElementById('hike-section-inner'));
  if (todayGenre) loadHomeTodayVideo(todayGenre);
  document.getElementById('goal-save-btn').addEventListener('click', saveGoal);
  document.getElementById('record-save-btn').addEventListener('click', saveRecord);
}

// ── 今日の動画ロード ──
async function loadHomeTodayVideo(genre) {
  const container = document.getElementById('video-section-content');
  if (!container) return;
  try {
    const videos = await dbGetAllByIndex('videoStock', 'genre', genre);
    renderHomeTodayVideo(genre, videos);
  } catch (err) {
    console.error('動画の読込に失敗しました:', err);
    const c = document.getElementById('video-section-content');
    if (c) c.innerHTML = '<p class="placeholder error">動画の読込に失敗しました</p>';
  }
}

function renderHomeTodayVideo(genre, videos) {
  const container = document.getElementById('video-section-content');
  if (!container) return;

  if (videos.length === 0) {
    container.innerHTML =
      `<p class="placeholder">動画未登録（ジャンル：${escHtml(genre)}）</p>`;
    _homeVideoShownId = null;
    return;
  }

  const pick = pickVideo(videos, _homeVideoShownId);
  _homeVideoShownId = pick.id;

  container.innerHTML = `
    <div class="video-card">
      ${pick.title ? `<p class="video-pick-title">${escHtml(pick.title)}</p>` : ''}
      <a class="video-pick-link" href="${escHtml(safeUrl(pick.url))}"
        target="_blank" rel="noopener noreferrer">▶ 動画を開く</a>
      <p class="video-pick-url-text">${escHtml(
        pick.url.length > 50 ? pick.url.slice(0, 50) + '…' : pick.url
      )}</p>
    </div>
    ${videos.length > 1
      ? '<button id="video-reroll-btn" class="btn-secondary">別の動画にする</button>'
      : ''}
  `;

  document.getElementById('video-reroll-btn')
    ?.addEventListener('click', () => renderHomeTodayVideo(genre, videos));
}

function pickVideo(videos, excludeId) {
  if (videos.length === 1 || excludeId === null) {
    return videos[Math.floor(Math.random() * videos.length)];
  }
  const others = videos.filter(v => v.id !== excludeId);
  const pool   = others.length > 0 ? others : videos;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── 長期目標の保存 ──
async function saveGoal() {
  const input  = document.getElementById('goal-input');
  const status = document.getElementById('goal-status');
  try {
    await dbPut('settings', { key: 'longTermGoal', value: input.value });
    status.className = 'status-msg';
    status.textContent = '保存しました ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    console.error('目標の保存に失敗しました:', err);
    status.className = 'status-msg error';
    status.textContent = '保存に失敗しました';
  }
}

// ── 今日の記録の保存 ──
async function saveRecord() {
  const dk      = dateKey(new Date());
  const status  = document.getElementById('record-status');
  const section = document.querySelector('.home-record-section');
  status.className = 'status-msg';
  status.textContent = '';

  try {
    let weekNumber = null;
    const activeSetting = await dbGet('settings', 'activePlanId');
    if (activeSetting) {
      const plan = await dbGet('plans', activeSetting.value);
      if (plan) weekNumber = plan.weekNumber;
    }
    await saveRecordForDate(dk, section, weekNumber);
    status.textContent = '記録を保存しました ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    console.error('記録の保存に失敗しました:', err);
    status.className = 'status-msg error';
    status.textContent = '保存に失敗しました';
  }
}
