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

// Alias (or domain) safe to use as a folder name.
export function folderName(payment) {
  const name = (payment.alias || payment.domain).replace(/[/\\:*?"<>|]/g, '-').trim();
  return name || payment.domain;
}

export function displayName(payment) {
  return payment.alias || payment.domain;
}

export async function getPayments() {
  const { payments } = await chrome.storage.local.get({ payments: [] });
  return payments;
}

async function setPayments(payments) {
  await chrome.storage.local.set({ payments });
}

export async function findById(id) {
  return (await getPayments()).find((p) => p.id === id) ?? null;
}

export async function findByDomain(domain) {
  return (await getPayments()).find((p) => p.domain === domain) ?? null;
}

export async function addPayment({ url, alias, type }) {
  const domain = domainFromUrl(url);
  if (!domain) throw new Error('Esta página no se puede guardar.');
  const payments = await getPayments();
  if (payments.some((p) => p.domain === domain)) {
    throw new Error('Este sitio ya está guardado.');
  }
  const payment = {
    id: crypto.randomUUID(),
    domain,
    alias: alias.trim(),
    type,
    url,
    createdAt: Date.now(),
    paidMonths: [],
  };
  await setPayments([...payments, payment]);
  return payment;
}

export async function updatePayment(id, changes) {
  const payments = await getPayments();
  await setPayments(payments.map((p) => (p.id === id ? { ...p, ...changes } : p)));
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

// "Octubre 2026"
export function monthLabel(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function isPaid(payment, date = new Date()) {
  return payment.paidMonths.includes(monthKey(date));
}

// Monthly payments that apply to a month: the ones saved on or before it.
export function monthlyPaymentsFor(payments, date = new Date()) {
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return payments.filter((p) => p.type === 'monthly' && p.createdAt < endOfMonth);
}

export async function setPaid(id, paid, date = new Date()) {
  const key = monthKey(date);
  const payments = await getPayments();
  await setPayments(payments.map((p) => {
    if (p.id !== id) return p;
    const others = p.paidMonths.filter((m) => m !== key);
    return { ...p, paidMonths: paid ? [...others, key] : others };
  }));
}

export function markPaid(id, date = new Date()) {
  return setPaid(id, true, date);
}
