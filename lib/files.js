import { folderName, monthFolderName } from './storage.js';

const DB_NAME = 'pagos';
const STORE = 'handles';
const PENDING_STORE = 'pendingPdfs';
const ROOT_KEY = 'root';

// Directory handles and PDF blobs can't go in chrome.storage, so they live in IndexedDB.
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn, storeName = STORE) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(storeName, mode).objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getRootHandle() {
  return idb('readonly', (store) => store.get(ROOT_KEY));
}

// Receipts waiting for the side panel to write them to the folder: PDFs captured from
// downloads (id = downloadId) and screenshots taken from the menu or shortcut (id = "shot-…").
// { id, paymentId, filename, createdAt, blob?, error? }
export function addPendingPdf(item) {
  return idb('readwrite', (store) => store.put(item), PENDING_STORE);
}

export function getPendingPdfs() {
  return idb('readonly', (store) => store.getAll(), PENDING_STORE);
}

export function deletePendingPdf(id) {
  return idb('readwrite', (store) => store.delete(id), PENDING_STORE);
}

// Opens the folder picker. Returns null if the user cancels.
export async function chooseRootFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'pagos', mode: 'readwrite' });
    await idb('readwrite', (store) => store.put(handle, ROOT_KEY));
    return handle;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

// Chrome may forget the grant between sessions; asking again needs a user click.
export async function ensureWritePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

// "2026-10-30_14-35-02"
export function timestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Pagos/<Mensuales|Únicos>/<2026-10 Octubre>/<alias o dominio>/
async function paymentFolder(root, payment, date) {
  // If the user picked a folder already called "Pagos", don't nest another one.
  const pagos = root.name === 'Pagos' ? root : await root.getDirectoryHandle('Pagos', { create: true });
  const typeDir = await pagos.getDirectoryHandle(payment.type === 'monthly' ? 'Mensuales' : 'Únicos', { create: true });
  const monthDir = await typeDir.getDirectoryHandle(monthFolderName(date), { create: true });
  return monthDir.getDirectoryHandle(folderName(payment), { create: true });
}

// "boleta.pdf" -> "boleta (2).pdf" until the name is free.
async function freeName(dir, name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${base} (${n})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch (err) {
      if (err.name === 'NotFoundError') return candidate;
      throw err;
    }
  }
}

// Writes the file and returns its path relative to the root folder.
export async function saveReceipt(root, payment, blob, extension, date = new Date()) {
  return saveFile(root, payment, blob, `${timestamp(date)}.${extension}`, date);
}

export async function saveFile(root, payment, blob, fileName, date = new Date()) {
  const dir = await paymentFolder(root, payment, date);
  const name = await freeName(dir, fileName.replace(/[/\\:*?"<>|]/g, '-'));
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();

  const prefix = root.name === 'Pagos' ? [] : ['Pagos'];
  return [root.name, ...prefix, payment.type === 'monthly' ? 'Mensuales' : 'Únicos',
    monthFolderName(date), folderName(payment), name].join('/');
}
