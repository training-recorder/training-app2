// 設定タブを開いた時点でデータをバックグラウンド取得しておく。
// こうすることでエクスポートボタンのクリック時に await が不要になり、
// iOS Safari でユーザージェスチャーが失効しなくなる。
let _exportDataCache = null;

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

  // データをバックグラウンドで事前取得（失敗時は画面にも表示）
  _exportDataCache = null;
  exportAllData()
    .then((d) => { _exportDataCache = d; })
    .catch((e) => {
      console.warn('export pre-fetch failed:', e);
      const msg = document.getElementById('settings-msg');
      if (msg) {
        msg.textContent = `[PF] データ取得失敗: ${escHtml(e.name)} – ${escHtml(e.message)}`;
        msg.className = 'status-msg error-msg';
      }
    });
}

// ── エクスポート ──
// 同期関数にして await を navigator.share より前に置かない（iOS ジェスチャー失効防止）
function handleExport() {
  const msg = document.getElementById('settings-msg');
  const show = (text, isError) => {
    msg.textContent = text;
    msg.className = 'status-msg ' + (isError ? 'error-msg' : 'success-msg');
  };

  // ステージ1: プリフェッチ済みデータの確認
  if (!_exportDataCache) {
    show('[1] データ未取得。設定タブを閉じて開き直してください。', true);
    return;
  }

  // ステージ2: JSON 生成
  let payload, blob, file, fileName;
  try {
    const now = new Date();
    fileName = `training-data-${dateKey(now)}.json`;
    payload = JSON.stringify({
      exportedAt: now.toISOString(),
      appVersion: 'stage9',
      data: _exportDataCache,
    });
    blob = new Blob([payload], { type: 'application/json' });
    file = new File([blob], fileName, { type: 'application/json' });
  } catch (e) {
    show(`[2] JSON生成失敗: ${escHtml(e.name)} – ${escHtml(e.message)}`, true);
    return;
  }

  const exportedAt = new Date();

  // ステージ3: Web Share API（ファイル対応）
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: fileName })
      .then(() => {
        _saveLastExport(exportedAt);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return; // ユーザーキャンセル
        // Share 失敗 → ダウンロードで代替しつつエラー詳細を表示
        show(`[3] Share失敗(${escHtml(e.name)}: ${escHtml(e.message)}) → ダウンロード試行中`, true);
        try {
          _downloadFallback(blob, fileName);
          _saveLastExport(exportedAt);
        } catch (e2) {
          show(`[3+4] Share失敗後のDL也失敗: ${escHtml(e2.name)} – ${escHtml(e2.message)}`, true);
        }
      });
    return;
  }

  // ステージ4: ダウンロードフォールバック（Web Share 非対応環境）
  try {
    _downloadFallback(blob, fileName);
    _saveLastExport(exportedAt);
  } catch (e) {
    show(`[4] DL失敗: ${escHtml(e.name)} – ${escHtml(e.message)}`, true);
  }
}

function _downloadFallback(blob, fileName) {
  const url = URL.createObjectURL(blob);
  // <a download> を試みる（PCブラウザ・Android Chrome で動作）
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // iOS Safari では download 属性が無視されるため window.open でフォールバック
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

async function _saveLastExport(now) {
  try {
    await dbPut('settings', { key: 'lastExportedAt', value: now.toISOString() });
    // キャッシュを更新（次回エクスポートで最新 settings を含むように）
    _exportDataCache = await exportAllData().catch(() => _exportDataCache);
    const lastEl = document.querySelector('.settings-last-export');
    if (lastEl) lastEl.textContent = `最終エクスポート：${dateKey(now)}`;
    const msg = document.getElementById('settings-msg');
    if (msg) {
      msg.textContent = 'エクスポートしました。';
      msg.className = 'status-msg success-msg';
    }
  } catch (e) {
    console.warn('lastExportedAt の保存に失敗:', e);
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
    _exportDataCache = null;
    msg.textContent = 'データを取り込みました。ホームに戻ります…';
    msg.className = 'status-msg success-msg';
    setTimeout(() => {
      switchScreen('home');
    }, 1200);
  } catch (err) {
    console.error('インポートに失敗しました:', err);
    msg.textContent = `インポートに失敗しました。エラー: ${escHtml(err.name)} – ${escHtml(err.message)}`;
    msg.className = 'status-msg error-msg';
  }
}
