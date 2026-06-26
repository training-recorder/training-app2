function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── カードHTML ──
function buildHikeCardHTML(h) {
  return `
    <div class="hike-card${h.done ? ' hike-done' : ''}" data-id="${escHtml(h.id)}">
      <div class="hike-card-header">
        <span class="hike-dest">${h.destination ? escHtml(h.destination) : '（行き先未定）'}</span>
        <span class="hike-order">${escHtml(h.order)}回目</span>
      </div>
      ${h.date   ? `<div class="hike-meta">📅 ${escHtml(h.date)}</div>`   : ''}
      ${h.access ? `<div class="hike-meta">🚃 ${escHtml(h.access)}</div>` : ''}
      ${h.note   ? `<div class="hike-note">📝 ${escHtml(h.note)}</div>`   : ''}
      <div class="hike-card-footer">
        <label class="hike-check-label">
          <input type="checkbox" class="hike-done-check"
            data-id="${escHtml(h.id)}"${h.done ? ' checked' : ''}>
          実施した
        </label>
        <div class="hike-card-actions">
          <button class="hike-edit-btn btn-secondary" data-id="${escHtml(h.id)}">編集</button>
          <button class="hike-delete-btn btn-delete-sm" data-id="${escHtml(h.id)}">削除</button>
        </div>
      </div>
    </div>`;
}

// ── セクション全体HTML ──
function buildHikeSectionHTML(hikes) {
  const hikesHTML = hikes.length === 0
    ? '<p class="placeholder">まだ登山予定がありません</p>'
    : hikes.map(buildHikeCardHTML).join('');

  return `
    <div class="hike-list">${hikesHTML}</div>
    <div class="hike-btn-row">
      <button class="hike-add-btn btn-secondary">＋ 登山を追加</button>
      <button class="hike-history-btn btn-link">過去の登山を見る ▾</button>
    </div>
    <div class="hike-history" hidden></div>`;
}

// ── 追加・編集フォームHTML ──
function buildHikeFormHTML(hike) {
  return `
    <div class="hike-form-title">${hike ? '登山を編集' : '登山を追加'}</div>
    <div class="hike-form-body">
      <label class="form-label">行き先（山の名前）</label>
      <input type="text" class="hike-input hf-destination"
        placeholder="○○山" autocomplete="off"
        value="${hike ? escHtml(hike.destination) : ''}">
      <label class="form-label">予定日</label>
      <input type="date" class="hike-input hf-date"
        value="${hike?.date ? escHtml(hike.date) : ''}">
      <label class="form-label">アクセス</label>
      <input type="text" class="hike-input hf-access"
        placeholder="電車・バス・登山口など" autocomplete="off"
        value="${hike ? escHtml(hike.access) : ''}">
      <label class="form-label">メモ（コース・装備など）</label>
      <textarea class="hike-textarea hf-note" rows="3"
        placeholder="コース・装備など...">${hike ? escHtml(hike.note) : ''}</textarea>
      <label class="hike-check-label hike-form-check">
        <input type="checkbox" class="hf-done"${hike?.done ? ' checked' : ''}>
        実施した
      </label>
    </div>
    <div class="hike-form-actions">
      <button class="hike-cancel-btn btn-secondary">キャンセル</button>
      <button class="hike-save-btn btn-primary">保存</button>
    </div>
    <p class="hike-status status-msg" aria-live="polite"></p>`;
}

// ── フォーム表示（新規追加 / カード置換） ──
function showHikeForm(containerEl, ym, editHike) {
  const formEl = document.createElement('div');
  formEl.className = 'hike-form';
  formEl.innerHTML = buildHikeFormHTML(editHike);

  if (editHike) {
    const card = containerEl.querySelector(`.hike-card[data-id="${editHike.id}"]`);
    card?.replaceWith(formEl);
  } else {
    const btnRow = containerEl.querySelector('.hike-btn-row');
    btnRow?.before(formEl);
    containerEl.querySelector('.hike-add-btn')?.setAttribute('disabled', '');
  }

  formEl.querySelector('.hike-save-btn').addEventListener('click', async () => {
    const statusEl = formEl.querySelector('.hike-status');
    statusEl.textContent = '';
    statusEl.className = 'hike-status status-msg';
    try {
      await saveHikeFromForm(formEl, ym, editHike?.id ?? null);
      await renderHikeSection(containerEl);
    } catch (err) {
      console.error('登山の保存に失敗しました:', err);
      statusEl.className = 'hike-status status-msg error';
      statusEl.textContent = '保存に失敗しました';
    }
  });

  formEl.querySelector('.hike-cancel-btn').addEventListener('click', () => {
    renderHikeSection(containerEl);
  });

  formEl.querySelector('.hf-destination').focus();
}

// ── フォームからデータを読み取って保存 ──
async function saveHikeFromForm(formEl, ym, editingId) {
  const destination = formEl.querySelector('.hf-destination').value.trim();
  const date        = formEl.querySelector('.hf-date').value;
  const access      = formEl.querySelector('.hf-access').value.trim();
  const note        = formEl.querySelector('.hf-note').value;
  const done        = formEl.querySelector('.hf-done').checked;

  let id, order;
  if (editingId) {
    id    = editingId;
    order = parseInt(editingId.split('_')[1], 10);
  } else {
    const existing = await getHikesByMonth(ym);
    order = existing.length > 0 ? Math.max(...existing.map(h => h.order)) + 1 : 1;
    id    = `${ym}_${order}`;
  }

  await saveHike({ id, yearMonth: ym, order, destination, date, access, note, done });
}

// ── 削除（確認ダイアログ付き） ──
async function removeHike(id, containerEl) {
  if (!confirm('この登山を削除しますか？')) return;
  try {
    await deleteHike(id);
    await renderHikeSection(containerEl);
  } catch (err) {
    console.error('削除に失敗しました:', err);
  }
}

// ── 過去の登山を表示 / 折りたたみ ──
async function showHikeHistory(containerEl) {
  const histEl = containerEl.querySelector('.hike-history');
  if (!histEl) return;

  if (!histEl.hidden) {
    histEl.hidden = true;
    return;
  }

  let allHikes;
  try {
    allHikes = await getAllHikes();
  } catch (err) {
    console.error('履歴の読込に失敗しました:', err);
    return;
  }

  const ym   = currentYearMonth();
  const past = allHikes.filter(h => h.yearMonth !== ym);

  if (past.length === 0) {
    histEl.innerHTML = '<p class="placeholder">まだ過去の登山はありません</p>';
    histEl.hidden = false;
    return;
  }

  const grouped = {};
  past.forEach(h => {
    if (!grouped[h.yearMonth]) grouped[h.yearMonth] = [];
    grouped[h.yearMonth].push(h);
  });
  const months = Object.keys(grouped).sort().reverse();

  histEl.innerHTML = months.map(m => {
    const [y, mo] = m.split('-');
    const items   = grouped[m].sort((a, b) => a.order - b.order);
    return `
      <div class="hike-history-month">
        <div class="hike-history-month-label">${escHtml(y)}年${escHtml(mo)}月</div>
        ${items.map(h => `
          <div class="hike-history-item${h.done ? ' hike-done' : ''}">
            <span class="hike-history-dest">${h.destination ? escHtml(h.destination) : '（行き先未定）'}</span>
            ${h.date ? `<span class="hike-history-date">${escHtml(h.date)}</span>` : ''}
            ${h.done ? '<span class="hike-done-badge">✓実施</span>' : ''}
          </div>`).join('')}
      </div>`;
  }).join('');

  histEl.hidden = false;
}

// ── セクション描画（DB読込 → HTML生成 → イベントバインド） ──
async function renderHikeSection(containerEl) {
  const ym = currentYearMonth();
  let hikes = [];
  try {
    hikes = await getHikesByMonth(ym);
  } catch (err) {
    console.error('登山データの読込に失敗しました:', err);
  }

  containerEl.innerHTML = buildHikeSectionHTML(hikes);

  containerEl.querySelector('.hike-add-btn')
    .addEventListener('click', () => showHikeForm(containerEl, ym, null));

  containerEl.querySelectorAll('.hike-edit-btn').forEach(btn => {
    const hike = hikes.find(h => h.id === btn.dataset.id);
    btn.addEventListener('click', () => showHikeForm(containerEl, ym, hike ?? null));
  });

  containerEl.querySelectorAll('.hike-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => removeHike(btn.dataset.id, containerEl));
  });

  containerEl.querySelectorAll('.hike-done-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const hike = hikes.find(h => h.id === cb.dataset.id);
      if (!hike) return;
      try {
        await saveHike({ ...hike, done: cb.checked });
        cb.closest('.hike-card')?.classList.toggle('hike-done', cb.checked);
      } catch (err) {
        console.error('保存に失敗しました:', err);
        cb.checked = !cb.checked;
      }
    });
  });

  containerEl.querySelector('.hike-history-btn')
    .addEventListener('click', () => showHikeHistory(containerEl));
}
