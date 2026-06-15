async function init() {
  try {
    await openDB();
  } catch (err) {
    console.error('DB の初期化に失敗しました:', err);
    document.getElementById('main-content').innerHTML =
      '<p class="error-msg">データベースの初期化に失敗しました。ページを再読み込みしてください。</p>';
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service Worker の登録に失敗しました:', err);
    });
  }

  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div id="screen-home"    class="screen active"></div>
    <div id="screen-import"  class="screen"></div>
    <div id="screen-history" class="screen"></div>
    <div id="screen-videos"  class="screen"></div>
  `;

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });

  await renderHome();
  renderImport();
}

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isCurrent = btn.dataset.screen === name;
    btn.classList.toggle('active', isCurrent);
    btn.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });

  if (name === 'home')    renderHome();
  if (name === 'history') renderHistory();
  if (name === 'videos')  renderVideos();
}

document.addEventListener('DOMContentLoaded', init);
