const DB_NAME = 'trainingApp';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('plans')) {
        db.createObjectStore('plans', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('records')) {
        const st = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        st.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('videoStock')) {
        const st = db.createObjectStore('videoStock', { keyPath: 'id', autoIncrement: true });
        st.createIndex('genre', 'genre', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('hikes')) {
        const st = db.createObjectStore('hikes', { keyPath: 'id' });
        st.createIndex('yearMonth', 'yearMonth', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGet(store, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  }));
}

function dbGetAll(store) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  }));
}

function dbPut(store, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  }));
}

function dbDelete(store, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  }));
}

// ── 登山（hikes）専用ヘルパー ──
function getHikesByMonth(yearMonth) {
  return dbGetAllByIndex('hikes', 'yearMonth', yearMonth)
    .then(list => list.sort((a, b) => a.order - b.order));
}

function getAllHikes() {
  return dbGetAll('hikes');
}

function saveHike(hike) {
  return dbPut('hikes', hike);
}

function deleteHike(id) {
  return dbDelete('hikes', id);
}

// ── エクスポート / インポート用 ──
const ALL_STORES = ['plans', 'records', 'videoStock', 'settings', 'hikes'];

function exportAllData() {
  return openDB().then((db) => {
    const tx = db.transaction(ALL_STORES, 'readonly');
    return Promise.all(
      ALL_STORES.map((store) => new Promise((resolve, reject) => {
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve({ store, data: req.result });
        req.onerror  = () => reject(req.error);
      }))
    );
  }).then((results) => {
    const data = {};
    results.forEach(({ store, data: rows }) => { data[store] = rows; });
    return data;
  });
}

function importAllData(data) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(ALL_STORES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);

    ALL_STORES.forEach((store) => {
      const os = tx.objectStore(store);
      os.clear();
      (data[store] || []).forEach((item) => os.put(item));
    });
  }));
}

function dbGetAllByIndex(store, indexName, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store)
                  .index(indexName)
                  .getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  }));
}
