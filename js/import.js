function renderImport() {
  const el = document.getElementById('screen-import');
  el.innerHTML = `
    <section>
      <h2>プラン取り込み</h2>
      <p class="import-hint">Claude チャットが出力した JSON を貼り付けてください。</p>
      <div class="import-form">
        <textarea id="import-input" rows="14"
          placeholder='{ "plan": { "title": "...", "weekNumber": 1, "days": [...] } }'
          spellcheck="false"></textarea>
        <button id="import-btn" class="btn-primary">取り込む</button>
      </div>
      <p id="import-status" class="status-msg" aria-live="polite"></p>
    </section>
  `;
  document.getElementById('import-btn').addEventListener('click', importPlan);
}

async function importPlan() {
  const raw    = document.getElementById('import-input').value.trim();
  const status = document.getElementById('import-status');
  status.className = 'status-msg';
  status.textContent = '';

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    showImportError('JSON の形式が正しくありません: ' + e.message);
    return;
  }

  const err = validatePlan(data);
  if (err) {
    showImportError(err);
    return;
  }

  try {
    const id = await dbPut('plans', { ...data.plan });
    await dbPut('settings', { key: 'activePlanId', value: id });
    document.getElementById('import-input').value = '';
    status.textContent = '取り込み成功しました ✓';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch (e) {
    console.error('プランの保存に失敗しました:', e);
    showImportError('保存に失敗しました。再度お試しください。');
  }
}

function validatePlan(data) {
  if (!data || typeof data !== 'object') return 'データがオブジェクトではありません。';
  const p = data.plan;
  if (!p)                                   return '"plan" キーがありません。';
  if (!p.title || typeof p.title !== 'string') return '"plan.title" が文字列で必要です。';
  if (typeof p.weekNumber !== 'number')        return '"plan.weekNumber" が数値で必要です。';
  if (!Array.isArray(p.days) || p.days.length === 0) return '"plan.days" が配列で必要です。';

  for (let i = 0; i < p.days.length; i++) {
    const d = p.days[i];
    if (typeof d.day !== 'number' || d.day < 1 || d.day > 7)
      return `days[${i}].day が 1〜7 の数値である必要があります。`;
    if (!Array.isArray(d.menu))
      return `days[${i}].menu が配列で必要です。`;
  }
  return null;
}

function showImportError(msg) {
  const status = document.getElementById('import-status');
  status.className = 'status-msg error';
  status.textContent = msg;
}
