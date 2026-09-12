/** Transactional browser persistence. Failure is surfaced, never called saved. */
export class SessionStore {
  constructor() { this.database = null; this.mode = 'memory'; this.chain = Promise.resolve(); }
  async open() {
    try {
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('astra-goldfish-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('sessions');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close another old Astra tab to enable autosave.'));
      });
      this.mode = 'indexeddb';
    } catch {
      try { localStorage.setItem('astra-storage-test', '1'); localStorage.removeItem('astra-storage-test'); this.mode = 'localstorage'; } catch { this.mode = 'memory'; }
    }
    return this;
  }
  async get(key = 'current') {
    if (this.mode === 'indexeddb') return new Promise((resolve, reject) => {
      const request = this.database.transaction('sessions').objectStore('sessions').get(key);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    if (this.mode === 'localstorage') { const text = localStorage.getItem(`astra-session-${key}`); return text ? JSON.parse(text) : null; }
    return null;
  }
  save(session) {
    const envelope = {savedAt: new Date().toISOString(), session};
    this.chain = this.chain.catch(() => {}).then(async () => {
      if (this.mode === 'memory') throw new Error('Browser storage is unavailable. Export your session to preserve it.');
      if (this.mode === 'indexeddb') return new Promise((resolve, reject) => {
        const tx = this.database.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions');
        const previous = store.get('current');
        previous.onsuccess = () => { if (previous.result) store.put(previous.result, 'previous'); store.put(envelope, 'current'); };
        tx.oncomplete = () => resolve(envelope.savedAt); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Autosave transaction was interrupted.'));
      });
      // Preserve a previous good record, even if a quota error rejects the next write.
      const previous = localStorage.getItem('astra-session-current');
      if (previous) localStorage.setItem('astra-session-previous', previous);
      localStorage.setItem('astra-session-current', JSON.stringify(envelope));
      return envelope.savedAt;
    });
    return this.chain;
  }
}
