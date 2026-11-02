import { captureTab } from './lib/capture.js';
import { addPendingPdf, timestamp } from './lib/files.js';
import { PANEL_PORT, lockNow } from './lib/lock.js';
import {
  displayName,
  domainFromUrl,
  shortName,
  dueStatus,
  findAllByDomain,
  findById,
  getPayments,
  getSettings,
  hasSitePermission,
  matchPatterns,
  migratePayments,
  monthKey,
  recurringPaymentsFor,
} from './lib/storage.js';

const BORDER_SCRIPT_ID = 'payment-border';

// Context menu ids: one entry for single-payment sites, a submenu for sites with several.
const MENU_ID = 'save-receipt';
const MENU_MULTI_ID = 'save-receipt-multi';
const MENU_PAYMENT_PREFIX = 'receipt:';
const MENU_CONTEXTS = ['page', 'frame', 'selection', 'link', 'image'];

// Open side panels (one per window at most). When the last one closes, the extension locks
// so the summary page can't stay open without the password.
const openPanels = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  openPanels.add(port);
  port.onDisconnect.addListener(() => {
    openPanels.delete(port);
    if (openPanels.size === 0) lockNow();
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await migratePayments();
  queueSync();
  tick();
});
chrome.runtime.onStartup.addListener(() => {
  queueSync();
  tick();
});

// This month's due payments with their status (paid, pending, soon, overdue).
async function currentStatuses() {
  const settings = await getSettings();
  const statuses = recurringPaymentsFor(await getPayments())
    .map((payment) => ({ payment, status: dueStatus(payment, new Date(), settings) }));
  return { settings, statuses };
}

// Pending count on the toolbar icon: red if something is overdue, orange otherwise.
async function updateBadge() {
  const { statuses } = await currentStatuses();
  const pending = statuses.filter(({ status }) => status.kind !== 'paid').length;
  const overdue = statuses.filter(({ status }) => status.kind === 'overdue').length;
  await chrome.action.setBadgeBackgroundColor({ color: overdue ? '#dc2626' : '#d97706' });
  await chrome.action.setBadgeText({ text: pending ? String(pending) : '' });
  const parts = [];
  if (pending) parts.push(`${pending} pendiente${pending === 1 ? '' : 's'} este mes`);
  if (overdue) parts.push(`${overdue} vencido${overdue === 1 ? '' : 's'}`);
  await chrome.action.setTitle({ title: parts.length ? `Pagos: ${parts.join(', ')}` : 'Pagos' });
}

// --- Reminders ---------------------------------------------------------------
// One notification per payment and month for "due soon", and one more once it's overdue.

async function checkReminders() {
  const { settings, statuses } = await currentStatuses();
  const now = new Date();
  if (!settings.notifications || now.getHours() < settings.reminderHour) return;

  const month = monthKey(now);
  const { notified = {} } = await chrome.storage.local.get('notified');
  // Forget past months so the map doesn't grow forever.
  const next = Object.fromEntries(Object.entries(notified).filter(([key]) => key.endsWith(`:${month}`)));

  for (const { payment, status } of statuses) {
    const key = `${payment.id}:${month}`;
    const name = displayName(payment);
    if (status.kind === 'soon' && !next[key]) {
      notify(payment, `${name}: ${status.text.toLowerCase()}`, 'Pulsa para ir a pagar.');
      next[key] = 'before';
    } else if (status.kind === 'overdue' && next[key] !== 'overdue') {
      notify(payment, `${name} está vencido`, `${status.text}. Pulsa para ir a pagar.`);
      next[key] = 'overdue';
    }
  }
  await chrome.storage.local.set({ notified: next });
}

function notify(payment, title, message) {
  chrome.notifications.create(`due:${payment.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1,
  });
}

// Click: go to the site (an already open tab if there is one).
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('due:')) return;
  chrome.notifications.clear(notificationId);
  const payment = await findById(notificationId.slice(4));
  if (!payment) return;
  const [tab] = (await chrome.tabs.query({ url: matchPatterns(payment.domain) }))
    .filter((t) => domainFromUrl(t.url) === payment.domain);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    const created = await chrome.tabs.create({ url: payment.url });
    await chrome.windows.update(created.windowId, { focused: true });
  }
});

function tick() {
  updateBadge();
  checkReminders();
}

// Periodic check: badge colour changes with the date and reminders fire at their hour.
// Only create the alarm if missing; re-creating it on every wake-up would reset its timer.
chrome.alarms.get('tick').then((alarm) => {
  if (!alarm) chrome.alarms.create('tick', { periodInMinutes: 30 });
});
chrome.alarms.clear('badge'); // Replaced by "tick".
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tick') tick();
});

const wantsBorder = (payment) => payment.showBorder !== false;

// Domains where at least one payment wants the border.
const borderDomains = (payments) => new Set(payments.filter(wantsBorder).map((p) => p.domain));

// Saved sites with the border turned on and access granted.
async function permittedDomains() {
  const domains = [];
  for (const domain of borderDomains(await getPayments())) {
    if (await hasSitePermission(domain)) domains.push(domain);
  }
  return domains;
}

// Keep the registered content script in sync with saved, permitted domains.
async function syncBorderScript(domains) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [BORDER_SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [BORDER_SCRIPT_ID] });
  }
  if (domains.length) {
    await chrome.scripting.registerContentScripts([{
      id: BORDER_SCRIPT_ID,
      matches: domains.flatMap(matchPatterns),
      js: ['border.js'],
      runAt: 'document_end',
    }]);
  }
}

// Registered scripts only run on new page loads, so update already open tabs too.
async function syncOpenTabs(domains) {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (domains.includes(domainFromUrl(tab.url))) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['border.js'] }).catch(() => {});
    }
  }
}

async function removeBorder(domain) {
  const tabs = await chrome.tabs.query({ url: matchPatterns(domain) });
  for (const tab of tabs) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        globalThis.__pagosBorderObserver?.disconnect();
        document.getElementById('__pagos-border')?.remove();
      },
    }).catch(() => {});
  }
}

// The right-click entries only show up on saved sites. Sites with one payment get a single
// entry; sites with several get a submenu with one entry per payment.
async function syncContextMenu() {
  const byDomain = Map.groupBy(await getPayments(), (p) => p.domain);
  const single = [...byDomain].filter(([, list]) => list.length === 1).map(([d]) => d);
  const multi = [...byDomain].filter(([, list]) => list.length > 1);

  await chrome.contextMenus.removeAll();
  const create = (props) => new Promise((resolve) => chrome.contextMenus.create(props, resolve));
  if (single.length) {
    await create({
      id: MENU_ID,
      title: 'Guardar comprobante (Mis Pagos al Día)',
      contexts: MENU_CONTEXTS,
      documentUrlPatterns: single.flatMap(matchPatterns),
    });
  }
  if (multi.length) {
    await create({
      id: MENU_MULTI_ID,
      title: 'Guardar comprobante (Mis Pagos al Día)',
      contexts: MENU_CONTEXTS,
      documentUrlPatterns: multi.flatMap(([d]) => matchPatterns(d)),
    });
    for (const [domain, list] of multi) {
      const sorted = list.toSorted((a, b) => shortName(a).localeCompare(shortName(b), 'es'));
      for (const payment of sorted) {
        await create({
          id: MENU_PAYMENT_PREFIX + payment.id,
          parentId: MENU_MULTI_ID,
          title: shortName(payment),
          contexts: MENU_CONTEXTS,
          documentUrlPatterns: matchPatterns(domain),
        });
      }
    }
  }
}

async function sync() {
  const domains = await permittedDomains();
  await syncBorderScript(domains);
  await syncOpenTabs(domains);
  await syncContextMenu();
}

// Serialize syncs so overlapping changes don't race on the script registration.
let syncChain = Promise.resolve();
function queueSync(beforeSync) {
  syncChain = syncChain
    .then(beforeSync)
    .then(sync)
    .catch((err) => console.error('Error al sincronizar el borde:', err));
  return syncChain;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) tick();
  if (!changes.payments) return;
  tick();
  const oldPayments = changes.payments.oldValue ?? [];
  const newPayments = changes.payments.newValue ?? [];
  const after = new Set(newPayments.map((p) => p.domain));
  // Permission is only returned once the last payment of a site is gone.
  const removed = [...new Set(oldPayments.map((p) => p.domain))].filter((d) => !after.has(d));
  const borderAfter = borderDomains(newPayments);
  const borderOff = [...borderDomains(oldPayments)].filter((d) => after.has(d) && !borderAfter.has(d));

  queueSync(async () => {
    for (const domain of borderOff) await removeBorder(domain);
    for (const domain of removed) {
      await removeBorder(domain);
      // Fails harmlessly if access comes from a broader grant (all sites).
      await chrome.permissions.remove({ origins: matchPatterns(domain) }).catch(() => {});
    }
  });
});

chrome.permissions.onAdded.addListener(() => queueSync());
chrome.permissions.onRemoved.addListener(() => queueSync());

// --- Screenshot from the context menu or keyboard shortcut ---------------------
// Both grant activeTab, which captureVisibleTab requires; a click inside the side panel doesn't.

// paymentId: the payment chosen in the submenu; otherwise the site's only payment, or
// null when it has several (the panel then asks which one).
async function saveReceiptFromTab(tab, paymentId = null) {
  const domain = tab?.url && domainFromUrl(tab.url);
  const payments = domain ? await findAllByDomain(domain) : [];
  if (payments.length === 0) return;
  if (!paymentId && payments.length === 1) paymentId = payments[0].id;

  const date = new Date();
  const pending = {
    id: `shot-${date.getTime()}`,
    paymentId,
    domain,
    filename: `${timestamp(date)}.png`,
    createdAt: date.getTime(),
  };
  try {
    pending.blob = await captureTab(tab);
  } catch (err) {
    pending.error = `No se pudo capturar la página (${err.message}).`;
  }
  await addPendingPdf(pending);
  chrome.runtime.sendMessage({ type: 'pending-pdfs' }).catch(() => {});
}

// The panel writes the file, so open it (allowed here because it's a user action).
function openPanel(tab) {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  const id = String(info.menuItemId);
  if (id === MENU_ID) {
    openPanel(tab);
    saveReceiptFromTab(tab);
  } else if (id.startsWith(MENU_PAYMENT_PREFIX)) {
    openPanel(tab);
    saveReceiptFromTab(tab, id.slice(MENU_PAYMENT_PREFIX.length));
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'save-receipt' || !tab) return;
  openPanel(tab);
  saveReceiptFromTab(tab);
});

// --- PDFs downloaded from saved sites ---------------------------------------
// Extensions can't read a finished download from disk, so the PDF is fetched again
// (with the site's session) and handed to the side panel, which writes it to the folder.

const isPdf = (item) => item.mime === 'application/pdf' || /\.pdf$/i.test(item.filename ?? '');

// Remember which saved site (and tab) started each download.
chrome.downloads.onCreated.addListener(async (item) => {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  for (const url of [item.referrer, item.finalUrl, item.url, activeTab?.url]) {
    const domain = url && domainFromUrl(url);
    const payments = domain ? await findAllByDomain(domain) : [];
    if (payments.length) {
      const tabId = activeTab && domainFromUrl(activeTab.url) === domain ? activeTab.id : null;
      // With several payments on the site, the panel asks which one the PDF belongs to.
      const paymentId = payments.length === 1 ? payments[0].id : null;
      await chrome.storage.session.set({ [`dl:${item.id}`]: { paymentId, domain, tabId } });
      return;
    }
  }
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  const key = `dl:${delta.id}`;
  const { [key]: source } = await chrome.storage.session.get(key);
  if (!source) return;
  await chrome.storage.session.remove(key);

  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || !isPdf(item)) return;

  const pending = {
    id: item.id,
    paymentId: source.paymentId,
    domain: source.domain,
    filename: item.filename.split(/[/\\]/).pop(),
    createdAt: Date.parse(item.startTime) || Date.now(),
  };
  try {
    pending.blob = await fetchPdf(item.finalUrl || item.url, source.tabId);
  } catch (err) {
    pending.error = err.message;
  }
  await addPendingPdf(pending);
  chrome.runtime.sendMessage({ type: 'pending-pdfs' }).catch(() => {}); // Panel may be closed.
});

async function fetchPdf(url, tabId) {
  let blob = null;
  // From the page first: works for blob: URLs and same-origin files that need cookies.
  if (tabId != null && !url.startsWith('data:')) {
    blob = await fetchInTab(tabId, url).catch(() => null);
  }
  if (!blob) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`El sitio respondió ${res.status}`);
    blob = await res.blob();
  }
  // Guard against saving a login or error page instead of the receipt.
  const header = await blob.slice(0, 5).text();
  if (header !== '%PDF-') throw new Error('No se pudo volver a obtener el PDF (el sitio no lo permite).');
  return new Blob([blob], { type: 'application/pdf' });
}

async function fetchInTab(tabId, url) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [url],
    func: async (url) => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    },
  });
  return result ? (await fetch(result)).blob() : null;
}
