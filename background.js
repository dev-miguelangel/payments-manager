import { captureTab } from './lib/capture.js';
import { addPendingPdf, timestamp } from './lib/files.js';
import {
  domainFromUrl,
  findByDomain,
  getPayments,
  hasSitePermission,
  isPaid,
  matchPatterns,
  monthlyPaymentsFor,
} from './lib/storage.js';

const BORDER_SCRIPT_ID = 'payment-border';

const MENU_ID = 'save-receipt';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Guardar comprobante (Pagos)',
    contexts: ['page', 'frame', 'selection', 'link', 'image'],
    visible: false,
  });
  queueSync();
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => {
  queueSync();
  updateBadge();
});

// Number of monthly payments still pending this month, shown on the toolbar icon.
async function updateBadge() {
  const pending = monthlyPaymentsFor(await getPayments()).filter((p) => !isPaid(p)).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  await chrome.action.setBadgeText({ text: pending ? String(pending) : '' });
  await chrome.action.setTitle({
    title: pending ? `Pagos: ${pending} pendiente${pending === 1 ? '' : 's'} este mes` : 'Pagos',
  });
}

// Recheck every few hours so the badge resets when a new month starts.
chrome.alarms.create('badge', { periodInMinutes: 60 * 6 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'badge') updateBadge();
});

const wantsBorder = (payment) => payment.showBorder !== false;

// Saved sites with the border turned on and access granted.
async function permittedDomains() {
  const domains = [];
  for (const payment of await getPayments()) {
    if (wantsBorder(payment) && await hasSitePermission(payment.domain)) domains.push(payment.domain);
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

// The right-click entry only shows up on saved sites.
async function syncContextMenu() {
  const domains = (await getPayments()).map((p) => p.domain);
  await chrome.contextMenus.update(MENU_ID, domains.length
    ? { visible: true, documentUrlPatterns: domains.flatMap(matchPatterns) }
    : { visible: false });
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
  if (area !== 'local' || !changes.payments) return;
  updateBadge();
  const oldPayments = changes.payments.oldValue ?? [];
  const newPayments = changes.payments.newValue ?? [];
  const after = new Set(newPayments.map((p) => p.domain));
  const removed = oldPayments.map((p) => p.domain).filter((d) => !after.has(d));
  const borderOff = newPayments
    .filter((p) => !wantsBorder(p) && oldPayments.some((o) => o.id === p.id && wantsBorder(o)))
    .map((p) => p.domain);

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

async function saveReceiptFromTab(tab) {
  const domain = tab?.url && domainFromUrl(tab.url);
  const payment = domain && await findByDomain(domain);
  if (!payment) return;

  const date = new Date();
  const pending = {
    id: `shot-${date.getTime()}`,
    paymentId: payment.id,
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
  if (info.menuItemId !== MENU_ID || !tab) return;
  openPanel(tab);
  saveReceiptFromTab(tab);
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
    const payment = domain && await findByDomain(domain);
    if (payment) {
      const tabId = activeTab && domainFromUrl(activeTab.url) === domain ? activeTab.id : null;
      await chrome.storage.session.set({ [`dl:${item.id}`]: { paymentId: payment.id, tabId } });
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
