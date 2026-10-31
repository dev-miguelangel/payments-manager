const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// "https://www.banco.cl/pago?id=1" -> "banco.cl"; null if not a web page.
export function domainFromUrl(url) {
  try {
    // blob:https://banco.cl/uuid -> https://banco.cl/uuid
    const { protocol, hostname } = new URL(url.startsWith('blob:') ? url.slice(5) : url);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// "2026-10"
export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// "2026-10 Octubre"
export function monthFolderName(date = new Date()) {
  return `${monthKey(date)} ${MONTHS[date.getMonth()]}`;
}

// "Octubre 2026"
export function monthLabel(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// Alias (or domain) safe to use as a folder name.
export function folderName(payment) {
  const name = (payment.alias || payment.domain).replace(/[/\\:*?"<>|]/g, '-').trim();
  return name || payment.domain;
}

// "banco.itau.cl.CC" with an alias, "banco.itau.cl" without.
export function displayName(payment) {
  return payment.alias ? `${payment.domain}.${payment.alias}` : payment.domain;
}

// Just the alias (or the domain): for places already scoped to one site, like its receipt buttons.
export function shortName(payment) {
  return payment.alias || payment.domain;
}

export const FREQUENCIES = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };

// "Mensual", "Anual"… or "Único".
export function frequencyLabel(payment) {
  return payment.type === 'recurring' ? (FREQUENCIES[payment.frequency] ?? `Cada ${payment.frequency} meses`) : 'Único';
}

// "2026-10" -> Date (first day of that month).
export function monthFromKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

const monthIndex = (key) => {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + month - 1;
};

export function typeFolderName(payment) {
  return payment.type === 'recurring' ? 'Recurrentes' : 'Únicos';
}

// --- Data model --------------------------------------------------------------

// Brings a payment saved by any earlier version up to the current shape.
// v1: { type: "monthly" | "once", paidMonths: ["2026-10"] }
function normalize(p) {
  const recurring = p.type === 'monthly' || p.type === 'recurring';
  const records = { ...(p.records ?? {}) };
  for (const key of p.paidMonths ?? []) {
    records[key] ??= { paid: true, paidAt: null, amount: null };
  }
  const { paidMonths, ...rest } = p;
  return {
    alias: '',
    showBorder: true,
    frequency: 1,
    startMonth: monthKey(new Date(p.createdAt ?? Date.now())),
    endMonth: null,
    dueDay: null,
    defaultAmount: null, // fixed installment (e.g. a loan), filled in when marked paid
    archived: false,
    fields: [],
    note: '',
    receipts: {},     // { "2026-10": [{ dir, name }] }, relative to Pagos/
    pastFolders: [],  // folder names used before an alias change
    captureMode: 'visible',
    successKeywords: [],
    ...rest,
    type: recurring ? 'recurring' : 'once',
    records,
  };
}

export async function getPayments() {
  const { payments } = await chrome.storage.local.get({ payments: [] });
  return payments.map(normalize);
}

async function setPayments(payments) {
  await chrome.storage.local.set({ payments });
}

// Persists the normalized shape so stored data matches the code (run on install/update).
export async function migratePayments() {
  const { payments } = await chrome.storage.local.get({ payments: [] });
  const normalized = payments.map(normalize);
  if (JSON.stringify(payments) !== JSON.stringify(normalized)) await setPayments(normalized);
}

export async function findById(id) {
  return (await getPayments()).find((p) => p.id === id) ?? null;
}

// A site can hold several payments (e.g. a bank portal used for power and water).
export async function findAllByDomain(domain) {
  return (await getPayments()).filter((p) => p.domain === domain);
}

// Reasons a name can't be used, or null. Names become folder names, so they must be unique,
// and a site with several payments needs aliases to tell them apart.
export function nameProblem(payments, { domain, alias, id = null }) {
  const others = payments.filter((p) => p.id !== id);
  const name = (alias.trim() || domain).toLocaleLowerCase('es');
  if (!alias.trim() && others.some((p) => p.domain === domain)) {
    return 'Este sitio ya tiene otro pago: ponle un alias para distinguirlos.';
  }
  // Folders are named after the alias, so aliases must be unique across all sites.
  if (others.some((p) => shortName(p).toLocaleLowerCase('es') === name)) {
    return `Ya hay un pago llamado "${alias.trim() || domain}".`;
  }
  return null;
}

export async function addPayment({ url, alias, type, defaultAmount = null }) {
  const domain = domainFromUrl(url);
  if (!domain) throw new Error('Esta página no se puede guardar.');
  const payments = await getPayments();
  const problem = nameProblem(payments, { domain, alias });
  if (problem) throw new Error(problem);
  const payment = normalize({
    id: crypto.randomUUID(),
    domain,
    alias: alias.trim(),
    type,
    url,
    defaultAmount: type === 'recurring' ? defaultAmount : null,
    createdAt: Date.now(),
  });
  await setPayments([...payments, payment]);
  return payment;
}

export async function updatePayment(id, changes) {
  const payments = await getPayments();
  await setPayments(payments.map((p) => (p.id === id ? { ...p, ...changes } : p)));
}

// Settings that belong to the site rather than to one payment (e.g. the border).
export async function updateDomain(domain, changes) {
  const payments = await getPayments();
  await setPayments(payments.map((p) => (p.domain === domain ? { ...p, ...changes } : p)));
}

export async function removePayment(id) {
  const payments = await getPayments();
  await setPayments(payments.filter((p) => p.id !== id));
}

// Host permission patterns for a saved domain (with and without www).
export function matchPatterns(domain) {
  return [`*://${domain}/*`, `*://www.${domain}/*`];
}

export async function hasSitePermission(domain) {
  return chrome.permissions.contains({ origins: matchPatterns(domain) });
}

// --- Paid state --------------------------------------------------------------

export function isPaid(payment, date = new Date()) {
  return Boolean(payment.records[monthKey(date)]?.paid);
}

export function isPaused(payment, date = new Date()) {
  return payment.type === 'recurring' && Boolean(payment.endMonth) && monthKey(date) >= payment.endMonth;
}

// Whether a recurring payment is due in a month: on or after its start, on its frequency
// (counted from the start month) and before it was paused.
export function appliesTo(payment, date = new Date()) {
  if (payment.type !== 'recurring' || payment.archived) return false;
  const key = monthKey(date);
  if (key < payment.startMonth || isPaused(payment, date)) return false;
  return (monthIndex(key) - monthIndex(payment.startMonth)) % payment.frequency === 0;
}

export function recurringPaymentsFor(payments, date = new Date()) {
  return payments.filter((p) => appliesTo(p, date));
}

// First month on or after `date` when the payment is due, or null if it's paused.
export function nextDueMonth(payment, date = new Date()) {
  let month = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = monthFromKey(payment.startMonth);
  if (month < start) month = start;
  for (let i = 0; i <= payment.frequency; i++) {
    if (isPaused(payment, month)) return null;
    if (appliesTo(payment, month)) return month;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  }
  return null;
}

const ARCHIVE_AFTER_DAYS = 60;

// One-off payments already paid a while ago: the panel suggests archiving them.
export function shouldSuggestArchive(payment, now = Date.now()) {
  if (payment.type !== 'once' || payment.archived) return false;
  const paid = Object.values(payment.records).filter((r) => r.paid);
  if (paid.length === 0) return false;
  const lastPaid = Math.max(...paid.map((r) => r.paidAt ?? payment.createdAt));
  return now - lastPaid > ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// Stops a recurring payment from showing up from this month on (or from next month if
// this month is already paid, so it stays in this month's list as paid).
export function pauseChanges(payment, date = new Date()) {
  const from = isPaid(payment, date) ? new Date(date.getFullYear(), date.getMonth() + 1, 1) : date;
  return { endMonth: monthKey(from) };
}

export async function setPaid(id, paid, date = new Date()) {
  const key = monthKey(date);
  const payments = await getPayments();
  await setPayments(payments.map((p) => {
    if (p.id !== id) return p;
    const records = { ...p.records };
    if (paid) {
      // A recurring payment with a fixed amount starts with it; it can still be changed.
      const amount = records[key]?.amount ?? (p.type === 'recurring' ? p.defaultAmount : null);
      records[key] = { ...records[key], amount, paid: true, paidAt: records[key]?.paidAt ?? Date.now() };
    } else {
      delete records[key];
    }
    return { ...p, records };
  }));
}

export function markPaid(id, date = new Date()) {
  return setPaid(id, true, date);
}

// --- Due dates and reminders -------------------------------------------------

const DEFAULT_SETTINGS = { notifications: true, reminderDaysBefore: 3, reminderHour: 9, currency: 'CLP' };

export async function getSettings() {
  const { settings } = await chrome.storage.local.get({ settings: {} });
  return { ...DEFAULT_SETTINGS, ...settings };
}

// Everything needed to restore the data: payments and settings. Receipts are already files in
// the folder, and the password is left out on purpose.
export async function backupData(date = new Date()) {
  return {
    app: 'pagos',
    version: chrome.runtime.getManifest().version,
    exportedAt: date.toISOString(),
    payments: await getPayments(),
    settings: await getSettings(),
  };
}

// Reason a parsed file can't be restored, or null.
export function backupProblem(data) {
  const ok = data && typeof data === 'object' && data.app === 'pagos' && Array.isArray(data.payments)
    && data.payments.every((p) => p && typeof p.id === 'string' && typeof p.domain === 'string'
      && (p.records == null || typeof p.records === 'object'));
  return ok ? null : 'El archivo no es un respaldo de Pagos.';
}

// Same month in both: the current record wins, but a missing amount is taken from the backup.
function mergeRecords(current, backup) {
  const records = { ...backup, ...current };
  for (const [key, record] of Object.entries(current)) {
    if (record.amount == null && backup[key]?.amount != null) records[key] = { ...record, amount: backup[key].amount };
  }
  return records;
}

function mergeReceipts(current, backup) {
  const receipts = { ...current };
  for (const [key, list] of Object.entries(backup)) {
    const seen = new Set((receipts[key] ?? []).map((r) => `${r.dir}/${r.name}`));
    receipts[key] = [...(receipts[key] ?? []), ...list.filter((r) => !seen.has(`${r.dir}/${r.name}`))];
  }
  return receipts;
}

// Merges a backup into the current data without deleting anything. A payment matches by id,
// or by site and alias (a site added again after "Forgot password" gets a new id). Matched
// payments keep the current settings and gain the backup's months, amounts and receipts;
// the rest are added. Settings the user changed here win over the backup's.
// Returns { added, merged }.
export async function restoreBackup(data) {
  const current = await getPayments();
  const sameName = (a, b) => a.domain === b.domain
    && a.alias.trim().toLocaleLowerCase('es') === b.alias.trim().toLocaleLowerCase('es');
  const result = [...current];
  let added = 0;
  let merged = 0;
  for (const raw of data.payments) {
    const backup = normalize(raw);
    const byId = result.findIndex((p) => p.id === backup.id);
    const index = byId >= 0 ? byId : result.findIndex((p) => sameName(p, backup));
    if (index < 0) {
      // Folder names must stay unique: an alias taken by another site gets a suffix.
      const alias = !nameProblem(result, backup) ? backup.alias
        : backup.alias ? `${backup.alias} (respaldo)` : 'Respaldo';
      result.push({ ...backup, alias });
      added++;
      continue;
    }
    const p = result[index];
    result[index] = {
      ...p,
      records: mergeRecords(p.records, backup.records),
      receipts: mergeReceipts(p.receipts, backup.receipts),
      pastFolders: [...new Set([...p.pastFolders, ...backup.pastFolders])],
      fields: p.fields.length ? p.fields : backup.fields,
      note: p.note || backup.note,
      dueDay: p.dueDay ?? backup.dueDay,
      defaultAmount: p.defaultAmount ?? backup.defaultAmount,
    };
    merged++;
  }
  const { settings: stored } = await chrome.storage.local.get({ settings: {} });
  await chrome.storage.local.set({ payments: result, settings: { ...(data.settings ?? {}), ...stored } });
  return { added, merged };
}

export async function updateSettings(changes) {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...changes } });
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const DAY_MS = 24 * 60 * 60 * 1000;

// Due date of a payment in a month. Day 31 falls on the month's last day in shorter months.
export function dueDate(payment, month = new Date()) {
  if (!payment.dueDay) return null;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(payment.dueDay, lastDay));
}

// { kind: "paid" | "pending" | "soon" | "overdue", days, text } for a payment in a month.
// days: days until the due date (negative once it's overdue).
export function dueStatus(payment, month = new Date(), { reminderDaysBefore = 3, now = new Date() } = {}) {
  if (isPaid(payment, month)) return { kind: 'paid', days: null, text: 'Pagado' };
  const due = dueDate(payment, month);
  // A due date before the payment was saved isn't a real miss: it was added after it passed.
  if (!due || due < startOfDay(new Date(payment.createdAt))) {
    return { kind: 'pending', days: null, text: 'Pendiente' };
  }
  const days = Math.round((due - startOfDay(now)) / DAY_MS);
  if (days < 0) {
    return { kind: 'overdue', days, text: days === -1 ? 'Vencido ayer' : `Vencido hace ${-days} días` };
  }
  if (days <= reminderDaysBefore) {
    const text = days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`;
    return { kind: 'soon', days, text };
  }
  return { kind: 'pending', days, text: `Pendiente · vence el ${due.getDate()}` };
}

// --- Amounts -----------------------------------------------------------------

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

// 24500 -> "$24.500"
export function formatAmount(amount) {
  return CLP.format(amount);
}

// "$24.500", "24500", "24.500" -> 24500; null if empty.
export function parseAmount(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

// Saves the amount paid in a month (setting an amount also marks it as paid).
export async function setAmount(id, amount, date = new Date()) {
  const key = monthKey(date);
  const payments = await getPayments();
  await setPayments(payments.map((p) => {
    if (p.id !== id) return p;
    const record = p.records[key] ?? { paid: true, paidAt: Date.now() };
    return { ...p, records: { ...p.records, [key]: { ...record, paid: true, amount } } };
  }));
}

export function amountFor(payment, date = new Date()) {
  return payment.records[monthKey(date)]?.amount ?? null;
}

// Most recent amount before a month, to suggest it and compute the change.
export function previousAmount(payment, date = new Date()) {
  const key = monthKey(date);
  const earlier = Object.entries(payment.records)
    .filter(([k, r]) => k < key && r.amount != null)
    .sort(([a], [b]) => b.localeCompare(a));
  return earlier[0]?.[1].amount ?? null;
}

// Sum of everything paid in a month, recurring and one-off.
export function monthTotal(payments, date = new Date()) {
  const key = monthKey(date);
  return payments.reduce((sum, p) => sum + (p.records[key]?.amount ?? 0), 0);
}

// The last `count` months up to `date` (oldest first) with the payment's record, for
// months where it was due or has a record.
export function paymentHistory(payment, date = new Date(), count = 12) {
  const rows = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = new Date(date.getFullYear(), date.getMonth() - i, 1);
    const record = payment.records[monthKey(month)] ?? null;
    if (record || appliesTo(payment, month)) rows.push({ month, record });
  }
  return rows;
}

// --- Receipts index ----------------------------------------------------------
// Remembers saved receipts so the lists can show 📎 without scanning folders on every render.

export function receiptsFor(payment, date = new Date()) {
  return payment.receipts[monthKey(date)] ?? [];
}

// Newest receipt across all months (for one-off payments).
export function latestReceipt(payment) {
  const months = Object.keys(payment.receipts).sort().reverse();
  for (const key of months) {
    const list = payment.receipts[key];
    if (list?.length) return list.at(-1);
  }
  return null;
}

export async function addReceipt(id, entry, date = new Date()) {
  const key = monthKey(date);
  const payments = await getPayments();
  await setPayments(payments.map((p) => {
    if (p.id !== id) return p;
    const list = (p.receipts[key] ?? []).filter((r) => r.dir !== entry.dir || r.name !== entry.name);
    return { ...p, receipts: { ...p.receipts, [key]: [...list, entry] } };
  }));
}

// Replaces the index with what is actually in the folders (after a scan).
export async function setReceipts(id, receipts) {
  const payments = await getPayments();
  await setPayments(payments.map((p) => (p.id === id ? { ...p, receipts } : p)));
}
