const WEEKDAY_LABEL = ['', '月', '火', '水', '木', '金', '土', '日'];

let _homeVideoShownId = null;

async function renderHome() {
  _homeVideoShownId = null;

  const today = new Date();
  const wd    = weekdayJp(today);
  const dk    = dateKey(today);
  const dateStr =
    `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${WEEKDAY_LABEL[wd]}）`;

  const el = document.getElementById('screen-home');

  // ── アクティブプランを読む ──
  let planInfoHTML = '';
  let menuHTML     = '<p class="placeholder">まだメニューがありません</p>';
  let todayItems   = [];
  let todayGenre   = null;

  try {
    const activeSetting = await dbGet('settings', 'activePlanId');
    if (activeSetting) {
      const plan = await dbGet('plans', activeSetting.value);
      if (plan) {
        planInfoHTML = `
          <div class="plan-info">
            <span class="plan-title">${escHtml(plan.title)}</span>
            <span class="plan-week">第 ${plan.weekNumber} 週</span>
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
              ${entry.totalMinutes ? `<span class="day-total">計 ${entry.totalMinutes} 分</span>` : ''}
            </div>
            <ul class="menu-list">${rows}</ul>`;
        } else {
          menuHTML = '<p class="placeholder">今日は予定なし（休み）</p>';
        }
      }
    }
  } catch (err) {
    console.error('プランの読込に失敗しました:', err);
  }

  // ── チェックボックス ──
  const checkboxesHTML = todayItems.length > 0
    ? `<div class="record-items">${
        todayItems.map((item, i) => `
          <label class="record-check-label">
            <input type="checkbox" class="record-item-check"
              data-name="${escHtml(item.name)}" id="rcheck_${i}">
            <span>${escHtml(item.name)}</span>
          </label>`).join('')
      }</div>`
    : '';

  // ── 動画セクション ──
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

    ${videoSectionHTML}

    <section>
      <h2>今日の記録</h2>
      ${checkboxesHTML}
      <div class="record-form">
        <label for="record-note" class="form-label">体調メモ</label>
        <textarea id="record-note" rows="2" placeholder="体調・気づきなど..."></textarea>
        <label for="record-extra" class="form-label">追加でやったこと</label>
        <textarea id="record-extra" rows="2" placeholder="メニュー外の運動など..."></textarea>
        <button id="record-save-btn" class="btn-primary">記録を保存</button>
      </div>
      <p id="record-status" class="status-msg" aria-live="polite"></p>
    </section>

    <section>
      <h2>長期目標</h2>
      <div class="goal-form">
        <textarea id="goal-input" rows="3" placeholder="長期目標を入力..."></textarea>
        <button id="goal-save-btn" class="btn-primary">保存</button>
      </div>
      <p id="goal-status" class="status-msg" aria-live="polite"></p>
    </section>
  `;

  // ── 動画を非同期ロード ──
  if (todayGenre) loadHomeTodayVideo(todayGenre);

  // ── 既存データを復元 ──
  try {
    const savedGoal = await dbGet('settings', 'longTermGoal');
    if (savedGoal) document.getElementById('goal-input').value = savedGoal.value;

    const existing = await dbGetAllByIndex('records', 'date', dk);
    if (existing.length > 0) {
      const rec = existing[0];
      (rec.items || []).forEach(item => {
        if (!item.done) return;
        document.querySelectorAll('.record-item-check').forEach(cb => {
          if (cb.dataset.name === item.name) cb.checked = true;
        });
      });
      if (rec.note)  document.getElementById('record-note').value  = rec.note;
      if (rec.extra) document.getElementById('record-extra').value = rec.extra;
    }
  } catch (err) {
    console.error('データの読込に失敗しました:', err);
  }

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
      <a class="video-pick-link" href="${escHtml(pick.url)}"
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
  const dk     = dateKey(new Date());
  const status = document.getElementById('record-status');
  status.className = 'status-msg';
  status.textContent = '';

  const checks = [...document.querySelectorAll('.record-item-check')];
  const items  = checks.map(cb => ({ name: cb.dataset.name, done: cb.checked }));
  const note   = document.getElementById('record-note').value;
  const extra  = document.getElementById('record-extra').value;

  try {
    let weekNumber = null;
    const activeSetting = await dbGet('settings', 'activePlanId');
    if (activeSetting) {
      const plan = await dbGet('plans', activeSetting.value);
      if (plan) weekNumber = plan.weekNumber;
    }

    const existing = await dbGetAllByIndex('records', 'date', dk);
    const record   = { date: dk, weekNumber, items, note, extra };
    if (existing.length > 0) record.id = existing[0].id;

    await dbPut('records', record);
    status.textContent = '記録を保存しました ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    console.error('記録の保存に失敗しました:', err);
    status.className = 'status-msg error';
    status.textContent = '保存に失敗しました';
  }
}
