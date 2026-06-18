function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// href に出す URL を安全化する。
// http(s) スキームのみ許可し、それ以外（javascript: 等）は無効化する。
// ※ escHtml は javascript: スキームを無害化できないため、URL は必ずこれを通す。
function safeUrl(url) {
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) ? s : '#';
}

function weekdayJp(date) {
  // JS getDay(): 0=日, 1=月, ..., 6=土
  // weekdayJp: 1=月, 2=火, ..., 7=日
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
