async function renderSettings() {
  const el = document.getElementById('screen-settings');

  const lastExport = await dbGet('settings', 'lastExportedAt').catch(() => null);
  const lastExportText = lastExport
    ? lastExport.value.slice(0, 10)
    : 'なし';

  el.innerHTML = `
    <section class="settings-section">
      <h2 class="section-title">データ管理</h2>
      <p class="settings-note">
        IndexedDB のデータはブラウザ管理のため、iOS Safari の自動削除や機種変更で
        消える可能性があります。定期的にバックアップを取ることを推奨します。
      </p>

      <div class="settings-row">
        <button id="export-btn" class="btn-primary settings-btn">データをエクスポート</button>
        <p class="settings-last-export">最終エクスポート：${escHtml(lastExportText)}</p>
      </div>

      <div class="settings-row">
        <button id="import-trigger-btn" class="btn-secondary settings-btn">データを取り込む</button>
        <input id="import-file-input" type="file" accept=".json" style="display:none">
      </div>

      <p id="settings-msg" class="status-msg" aria-live="polite"></p>
    </section>

    <div id="import-confirm-dialog" class="dialog-overlay" hidden>
      <div class="dialog-box" role="alertdialog" aria-modal="true"
           aria-labelledby="dialog-title" aria-describedby="dialog-desc">
        <h3 id="dialog-title" class="dialog-title">上書き確認</h3>
        <p id="dialog-desc" class="dialog-desc">
          現在のデータを全て上書きします。元に戻せません。よろしいですか？
        </p>
        <div class="dialog-actions">
          <button id="dialog-cancel-btn" class="btn-secondary">キャンセル</button>
          <button id="dialog-confirm-btn" class="btn-danger">上書きする</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('import-trigger-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', handleFileSelect);
  document.getElementById('dialog-cancel-btn').addEventListener('click', closeDialog);
}

// ── エクスポート ──
async function handleExport() {
  const msg = document.getElementById('settings-msg');
  msg.textContent = '';
  try {
    const data = await exportAllData();
    const now = new Date();
    const payload = JSON.stringify({
      exportedAt: now.toISOString(),
      appVersion: 'stage9',
      data,
    });
    const fileName = `training-data-${dateKey(now)}.json`;
    const blob = new Blob([payload], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    let shared = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        shared = true;
      } catch (e) {
        if (e.name === 'AbortError') {
          // ユーザーがキャンセル → 何もしない
          return;
        }
        // NotAllowedError 等（await後にジェスチャー失効など）→ ダウンロードで代替
        console.warn('Web Share API failed, falling back to download:', e);
      }
    }

    if (!shared) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    await dbPut('settings', { key: 'lastExportedAt', value: now.toISOString() });
    const lastEl = document.querySelector('.settings-last-export');
    if (lastEl) lastEl.textContent = `最終エクスポート：${dateKey(now)}`;
    msg.textContent = 'エクスポートしました。';
    msg.className = 'status-msg success-msg';
  } catch (err) {
    console.error('エクスポートに失敗しました:', err);
    msg.textContent = 'エクスポートに失敗しました。';
    msg.className = 'status-msg error-msg';
  }
}

// ── ファイル選択 → 構造チェック → ダイアログ ──
let _pendingImportData = null;

function handleFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const msg = document.getElementById('settings-msg');
  msg.textContent = '';

  const reader = new FileReader();
  reader.onload = (ev) => {
    let parsed;
    try {
      parsed = JSON.parse(ev.target.result);
    } catch {
      msg.textContent = '読み込みに失敗しました。JSONファイルを選択してください。';
      msg.className = 'status-msg error-msg';
      return;
    }
    if (!validateImportData(parsed)) {
      msg.textContent = 'ファイルの形式が正しくありません。エクスポートしたファイルを選択してください。';
      msg.className = 'status-msg error-msg';
      return;
    }
    _pendingImportData = parsed.data;
    openDialog();
  };
  reader.readAsText(file);
}

function validateImportData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!obj.exportedAt || !obj.data || typeof obj.data !== 'object') return false;
  const stores = ['plans', 'records', 'videoStock', 'settings', 'hikes'];
  return stores.every((s) => Array.isArray(obj.data[s]));
}

// ── ダイアログ ──
function openDialog() {
  const dialog = document.getElementById('import-confirm-dialog');
  dialog.hidden = false;
  document.getElementById('dialog-confirm-btn').onclick = handleImportConfirm;
}

function closeDialog() {
  const dialog = document.getElementById('import-confirm-dialog');
  dialog.hidden = true;
  _pendingImportData = null;
}

// ── インポート実行 ──
async function handleImportConfirm() {
  closeDialog();
  const msg = document.getElementById('settings-msg');
  if (!_pendingImportData) return;
  const data = _pendingImportData;
  _pendingImportData = null;

  try {
    await importAllData(data);
    msg.textContent = 'データを取り込みました。ホームに戻ります…';
    msg.className = 'status-msg success-msg';
    setTimeout(() => {
      switchScreen('home');
    }, 1200);
  } catch (err) {
    console.error('インポートに失敗しました:', err);
    msg.textContent = 'インポートに失敗しました。';
    msg.className = 'status-msg error-msg';
  }
}
