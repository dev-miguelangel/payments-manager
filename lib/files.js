import { folderName, monthFolderName, typeFolderName } from './storage.js';

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

// "Forgot password": drops the chosen folder and receipts still waiting to be written.
// Stores are emptied rather than the database deleted, since other pages keep it open.
export async function clearFileData() {
  await idb('readwrite', (store) => store.clear(), STORE);
  await idb('readwrite', (store) => store.clear(), PENDING_STORE);
}

export function getRootHandle() {
  return idb('readonly', (store) => store.get(ROOT_KEY));
}

// Receipts waiting for the side panel to write them to the folder: PDFs captured from
// downloads (id = downloadId) and screenshots taken from the menu or shortcut (id = "shot-…").
// { id, paymentId, domain, filename, createdAt, blob?, error? }
// paymentId is null when the site has several payments; the panel asks which one it is.
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

// If the user picked a folder already called "Pagos", don't nest another one.
async function pagosDir(root, { create = true } = {}) {
  return root.name === 'Pagos' ? root : root.getDirectoryHandle('Pagos', { create });
}

// Pagos/<Recurrentes|Únicos>/<2026-10 Octubre>/<alias o dominio>/
async function paymentFolder(root, payment, date) {
  const pagos = await pagosDir(root);
  const typeDir = await pagos.getDirectoryHandle(typeFolderName(payment), { create: true });
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

// Writes the file. Returns { path } (for showing, from the root folder) and
// { dir, name } (relative to Pagos/, to find it again later).
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

  const dirPath = [typeFolderName(payment), monthFolderName(date), folderName(payment)].join('/');
  const prefix = root.name === 'Pagos' ? [] : ['Pagos'];
  return { path: [root.name, ...prefix, dirPath, name].join('/'), dir: dirPath, name };
}

// Pagos/Respaldos/pagos-2026-10-30_14-35-02.json. Returns the path to show.
// prefix: "pagos-antes-de-restaurar" for the automatic one taken before a restore.
export async function saveBackup(root, data, date = new Date(), prefix = 'pagos') {
  const dir = await (await pagosDir(root)).getDirectoryHandle('Respaldos', { create: true });
  const name = await freeName(dir, `${prefix}-${timestamp(date)}.json`);
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  await writable.close();
  const parents = root.name === 'Pagos' ? [] : ['Pagos'];
  return [root.name, ...parents, 'Respaldos', name].join('/');
}

// Lets the user pick a backup file, starting in Pagos/Respaldos/ when it exists.
// Returns the parsed JSON, or null if cancelled.
export async function pickBackupFile(root) {
  let startIn = 'documents';
  if (root && (await root.queryPermission({ mode: 'read' })) === 'granted') {
    const pagos = await pagosDir(root, { create: false }).catch(() => null);
    startIn = (pagos && await childDir(pagos, 'Respaldos').catch(() => null)) ?? root;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      id: 'pagos-backup',
      startIn,
      types: [{ description: 'Respaldo de Pagos', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    try {
      return { name: file.name, data: JSON.parse(await file.text()) };
    } catch {
      throw new Error('El archivo no es un respaldo válido.');
    }
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

// --- Reading receipts back ---------------------------------------------------

async function childDir(dir, name) {
  try {
    return await dir.getDirectoryHandle(name);
  } catch (err) {
    if (err.name === 'NotFoundError' || err.name === 'TypeMismatchError') return null;
    throw err;
  }
}

// Every file in the payment's folders, newest month first: [{ month, dir, name, lastModified }].
// Looks in both type folders and the old "Mensuales/" (v0.5 and earlier), and under past
// folder names, so receipts saved before a type or alias change still show up.
export async function listReceipts(root, payment) {
  const pagos = await pagosDir(root, { create: false }).catch(() => null);
  if (!pagos) return [];
  const folders = [...new Set([folderName(payment), ...(payment.pastFolders ?? [])])];
  const found = [];
  for (const typeName of ['Recurrentes', 'Únicos', 'Mensuales']) {
    const typeDir = await childDir(pagos, typeName);
    if (!typeDir) continue;
    for await (const [monthName, monthDir] of typeDir.entries()) {
      const month = /^(\d{4}-\d{2})/.exec(monthName)?.[1];
      if (monthDir.kind !== 'directory' || !month) continue;
      for (const folder of folders) {
        const dir = await childDir(monthDir, folder);
        if (!dir) continue;
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind !== 'file' || name.startsWith('.')) continue;
          const file = await handle.getFile();
          found.push({ month, dir: `${typeName}/${monthName}/${folder}`, name, lastModified: file.lastModified });
        }
      }
    }
  }
  return found.sort((a, b) => b.month.localeCompare(a.month) || b.lastModified - a.lastModified);
}

// { dir, name } relative to Pagos/ -> File. Throws NotFoundError if it was moved or deleted.
export async function readReceipt(root, { dir, name }) {
  let handle = await pagosDir(root, { create: false });
  for (const part of dir.split('/')) handle = await handle.getDirectoryHandle(part);
  return (await handle.getFileHandle(name)).getFile();
}
