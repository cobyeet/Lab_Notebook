const DB = `open-lab-notebook:${location.pathname.replace(/\/(?:index.html)?$/, "")}`;
export function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("notebook");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readNotebook() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("notebook");
    const r = tx.objectStore("notebook").get("current");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeNotebook(notebook) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("notebook", "readwrite");
    tx.objectStore("notebook").put(notebook, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () =>
      reject(tx.error || new Error("Storage transaction aborted."));
  });
}
