const DB_NAME = 'trainingApp';
const DB_VERSION = 1;

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
