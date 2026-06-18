const VIDEO_GENRES = ['太極拳', 'ヨガ', 'ストレッチ', '筋トレ'];

let currentVideoGenre = VIDEO_GENRES[0];

async function renderVideos() {
  const el = document.getElementById('screen-videos');
  el.innerHTML = `
    <section>
      <h2>ジャンル</h2>
      <div class="genre-tabs">
        ${VIDEO_GENRES.map(g => `
          <button class="genre-tab${g === currentVideoGenre ? ' active' : ''}"
            data-genre="${escHtml(g)}">${escHtml(g)}</button>
        `).join('')}
      </div>
    </section>

    <section>
      <h2>URL を追加</h2>
      <div class="video-add-form">
        <input type="url" id="video-url-input"
          placeholder="https://youtu.be/..." inputmode="url" autocomplete="off">
        <input type="text" id="video-title-input"
          placeholder="タイトル（任意）" autocomplete="off">
        <button id="video-add-btn" class="btn-primary">追加</button>
      </div>
      <p id="video-add-status" class="status-msg" aria-live="polite"></p>
    </section>

    <section>
      <h2 id="video-list-heading"></h2>
      <div id="video-list"></div>
    </section>
  `;

  document.querySelectorAll('.genre-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentVideoGenre = btn.dataset.genre;
      document.querySelectorAll('.genre-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.genre === currentVideoGenre));
      await loadVideoList();
    });
  });

  document.getElementById('video-add-btn').addEventListener('click', addVideo);

  await loadVideoList();
}

async function loadVideoList() {
  document.getElementById('video-list-heading').textContent =
    `${currentVideoGenre} の動画`;
  try {
    const videos = await dbGetAllByIndex('videoStock', 'genre', currentVideoGenre);
    renderVideoList(videos);
  } catch (err) {
    console.error('動画一覧の読込に失敗しました:', err);
  }
}

function renderVideoList(videos) {
  const container = document.getElementById('video-list');
  if (videos.length === 0) {
    container.innerHTML = '<p class="placeholder">まだ登録されていません</p>';
    return;
  }
  container.innerHTML = videos.map(v => `
    <div class="video-item">
      <div class="video-info">
        ${v.title ? `<div class="video-title">${escHtml(v.title)}</div>` : ''}
        <a class="video-url" href="${escHtml(safeUrl(v.url))}"
          target="_blank" rel="noopener noreferrer">
          ${escHtml(v.url.length > 48 ? v.url.slice(0, 48) + '…' : v.url)}
        </a>
      </div>
      <button class="btn-delete" data-id="${v.id}" aria-label="削除">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteVideo(Number(btn.dataset.id)));
  });
}

async function addVideo() {
  const urlInput   = document.getElementById('video-url-input');
  const titleInput = document.getElementById('video-title-input');
  const status     = document.getElementById('video-add-status');
  status.className = 'status-msg';
  status.textContent = '';

  const url   = urlInput.value.trim();
  const title = titleInput.value.trim();

  if (!url) {
    status.className = 'status-msg error';
    status.textContent = 'URL を入力してください。';
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    status.className = 'status-msg error';
    status.textContent = 'https:// で始まる URL を入力してください。';
    return;
  }

  try {
    await dbPut('videoStock', { genre: currentVideoGenre, url, title });
    urlInput.value   = '';
    titleInput.value = '';
    status.textContent = '追加しました ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
    await loadVideoList();
  } catch (err) {
    console.error('動画の追加に失敗しました:', err);
    status.className = 'status-msg error';
    status.textContent = '追加に失敗しました。';
  }
}

async function deleteVideo(id) {
  try {
    await dbDelete('videoStock', id);
    await loadVideoList();
  } catch (err) {
    console.error('動画の削除に失敗しました:', err);
  }
}
