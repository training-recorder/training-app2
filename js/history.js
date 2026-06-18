const WDAY = ['', '月', '火', '水', '木', '金', '土', '日'];

let histYear, histMonth, allRecords = [];

async function renderHistory() {
  const el = document.getElementById('screen-history');
  el.innerHTML = `
    <section>
      <h2>カレンダー</h2>
      <div class="cal-nav">
        <button id="cal-prev" class="btn-icon" aria-label="前月">‹</button>
        <span id="cal-month-label"></span>
        <button id="cal-next" class="btn-icon" aria-label="次月">›</button>
      </div>
      <div id="cal-grid"></div>
    </section>

    <section id="record-detail" hidden>
      <h2 id="detail-date-label"></h2>
      <div id="detail-content"></div>
      <div id="detail-actions" class="detail-actions"></div>
    </section>

    <section>
      <h2>記録一覧</h2>
      <div id="history-list"></div>
    </section>
  `;

  const today = new Date();
  histYear  = today.getFullYear();
  histMonth = today.getMonth();

  allRecords = await dbGetAll('records');
  allRecords.sort((a, b) => b.date.localeCompare(a.date));

  buildCalendar();
  buildList();

  document.getElementById('cal-prev').addEventListener('click', () => {
    histMonth--;
    if (histMonth < 0) { histMonth = 11; histYear--; }
    buildCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    histMonth++;
    if (histMonth > 11) { histMonth = 0; histYear++; }
    buildCalendar();
  });
}

function buildCalendar() {
  const recordDates = new Set(allRecords.map(r => r.date));
  const today = dateKey(new Date());
  const y = histYear, m = histMonth;

  document.getElementById('cal-month-label').textContent = `${y}年${m + 1}月`;

  const firstDow = new Date(y, m, 1).getDay();           // 0=日…6=土
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const emptyBefore = firstDow === 0 ? 6 : firstDow - 1; // 月曜始まり

  let html = '<div class="cal-headers">';
  ['月','火','水','木','金','土','日'].forEach(h => {
    html += `<div class="cal-hdr">${h}</div>`;
  });
  html += '</div><div class="cal-days">';
  for (let i = 0; i < emptyBefore; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (dk === today)           cls += ' today';
    if (recordDates.has(dk))    cls += ' has-record';
    html += `<div class="${cls}" data-date="${dk}">${d}</div>`;
  }
  html += '</div>';

  document.getElementById('cal-grid').innerHTML = html;
  document.querySelectorAll('.cal-day[data-date]').forEach(cell => {
    cell.addEventListener('click', () => showDetail(cell.dataset.date));
  });
}

function buildList() {
  const container = document.getElementById('history-list');
  if (allRecords.length === 0) {
    container.innerHTML = '<p class="placeholder">まだ記録がありません</p>';
    return;
  }
  container.innerHTML = allRecords.map(r => {
    const wd  = weekdayJp(new Date(r.date + 'T00:00:00'));
    const lbl = `${r.date.replace(/-/g,'/')}（${WDAY[wd]}）`;
    const doneItems = (r.items || []).filter(i => i.done).map(i => escHtml(i.name));
    let sub = doneItems.join('・');
    if (r.extra) sub += (sub ? '・' : '') + escHtml(r.extra);
    if (!sub && r.note) sub = escHtml(r.note);
    if (!sub) sub = '（メモなし）';
    return `
      <div class="history-item" data-date="${r.date}">
        <div class="history-date">${lbl}</div>
        <div class="history-sub">${sub}</div>
      </div>`;
  }).join('');

  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => showDetail(item.dataset.date));
  });
}

function showDetail(dateStr) {
  const rec     = allRecords.find(r => r.date === dateStr);
  const wd      = weekdayJp(new Date(dateStr + 'T00:00:00'));
  const section = document.getElementById('record-detail');
  const today   = dateKey(new Date());

  document.getElementById('detail-date-label').textContent =
    `${dateStr.replace(/-/g,'/')}（${WDAY[wd]}）`;

  if (!rec) {
    document.getElementById('detail-content').innerHTML =
      '<p class="placeholder">この日の記録はありません</p>';
  } else {
    const items = rec.items || [];
    const itemsHTML = items.length > 0
      ? `<ul class="detail-items">${items.map(i =>
          `<li class="${i.done ? 'done' : 'not-done'}">
            ${i.done ? '✓' : '–'} ${escHtml(i.name)}
          </li>`).join('')}</ul>`
      : '';
    const noteHTML  = rec.note  ? `<p class="detail-note">📝 ${escHtml(rec.note)}</p>`  : '';
    const extraHTML = rec.extra ? `<p class="detail-extra">➕ ${escHtml(rec.extra)}</p>` : '';
    const body = itemsHTML + noteHTML + extraHTML;
    document.getElementById('detail-content').innerHTML =
      body || '<p class="placeholder">（内容なし）</p>';
  }

  const isFuture  = dateStr > today;
  const actionsEl = document.getElementById('detail-actions');
  if (!isFuture) {
    actionsEl.innerHTML =
      '<button id="detail-edit-btn" class="btn-secondary edit-btn">編集</button>';
    document.getElementById('detail-edit-btn')
      .addEventListener('click', () => showEditForm(dateStr));
  } else {
    actionsEl.innerHTML =
      '<p class="detail-future-note">未来日付は編集できません</p>';
  }

  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function showEditForm(dateStr) {
  const contentEl = document.getElementById('detail-content');
  const actionsEl = document.getElementById('detail-actions');

  contentEl.innerHTML = '<p class="placeholder">読込中...</p>';
  actionsEl.innerHTML = '';

  let existingRecord = null;
  let menuItems  = [];
  let weekNumber = null;

  try {
    const existing = await dbGetAllByIndex('records', 'date', dateStr);
    existingRecord = existing.length > 0 ? existing[0] : null;
    weekNumber = existingRecord?.weekNumber ?? null;

    const activeSetting = await dbGet('settings', 'activePlanId');
    if (activeSetting) {
      const plan = await dbGet('plans', activeSetting.value);
      if (plan) {
        if (weekNumber === null) weekNumber = plan.weekNumber;
        const wd    = weekdayJp(new Date(dateStr + 'T00:00:00'));
        const entry = (plan.days || []).find(d => d.day === wd);
        if (entry) menuItems = entry.menu || [];
      }
    }
  } catch (err) {
    console.error('編集データの読込に失敗しました:', err);
    contentEl.innerHTML = '<p class="placeholder error">読込に失敗しました</p>';
    return;
  }

  const editContainer = document.createElement('div');
  editContainer.className = 'edit-form-container';
  editContainer.innerHTML = buildRecordFormHTML(menuItems, existingRecord);
  contentEl.innerHTML = '';
  contentEl.appendChild(editContainer);

  actionsEl.innerHTML = `
    <div class="edit-actions">
      <button id="edit-cancel-btn" class="btn-secondary">キャンセル</button>
      <button id="edit-save-btn" class="btn-primary">保存</button>
    </div>
    <p id="edit-status" class="status-msg" aria-live="polite"></p>
  `;

  document.getElementById('edit-save-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('edit-status');
    statusEl.className = 'status-msg';
    statusEl.textContent = '';
    try {
      await saveRecordForDate(dateStr, editContainer, weekNumber);
      allRecords = await dbGetAll('records');
      allRecords.sort((a, b) => b.date.localeCompare(a.date));
      buildCalendar();
      buildList();
      showDetail(dateStr);
    } catch (err) {
      console.error('記録の保存に失敗しました:', err);
      statusEl.className = 'status-msg error';
      statusEl.textContent = '保存に失敗しました';
    }
  });

  document.getElementById('edit-cancel-btn').addEventListener('click', () => {
    showDetail(dateStr);
  });
}
