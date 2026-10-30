import {
  addPayment,
  displayName,
  domainFromUrl,
  findByDomain,
  findById,
  getPayments,
  hasSitePermission,
  isPaid,
  markPaid,
  matchPatterns,
  monthLabel,
  monthlyPaymentsFor,
  removePayment,
  setPaid,
  updatePayment,
} from './lib/storage.js';
import { captureTab } from './lib/capture.js';
import {
  addPendingPdf,
  chooseRootFolder,
  deletePendingPdf,
  ensureWritePermission,
  getPendingPdfs,
  getRootHandle,
  saveFile,
  saveReceipt,
} from './lib/files.js';

const $ = (id) => document.getElementById(id);

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;
$('general-btn').innerHTML = GEAR_SVG;

const ALL_SITES = { origins: ['<all_urls>'] };

let currentTab = null;
let currentUrl = null;
let currentPayment = null;
let rootHandle = null;
// Payment whose settings are open, or null.
let settingsId = null;
let settingsPayment = null;
// First day of the month shown in the monthly checklist.
let viewMonth = startOfMonth(new Date());

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function setReceiptStatus(message, kind = '') {
  $('receipt-status').textContent = message;
  $('receipt-status').className = `status ${kind}`;
  $('receipt-status').hidden = !message;
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

// --- Views -----------------------------------------------------------------

function showView(name) {
  for (const view of ['main', 'site', 'general']) $(`view-${view}`).hidden = view !== name;
  window.scrollTo(0, 0);
}

function openSiteSettings(id) {
  settingsId = id;
  renderSiteSettings({ resetForm: true });
  showView('site');
}

function openMain() {
  settingsId = null;
  showView('main');
}

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', openMain));
$('general-btn').addEventListener('click', () => showView('general'));

// --- Main view -------------------------------------------------------------

async function renderCurrent() {
  currentTab = await getActiveTab();
  currentUrl = currentTab?.url ?? null;
  const domain = currentUrl && domainFromUrl(currentUrl);
  const previousId = currentPayment?.id;
  currentPayment = domain ? await findByDomain(domain) : null;
  if (currentPayment?.id !== previousId) {
    setReceiptStatus('');
    $('capture-help').hidden = true;
    $('save-form').hidden = true;
  }

  $('receipt-box').hidden = !currentPayment;
  $('add-btn').hidden = !domain || Boolean(currentPayment) || !$('save-form').hidden;
  if (currentPayment) $('save-form').hidden = true;
  $('add-domain').textContent = domain ?? '';
}

// Switches to a tab already open on the site (this window first), or opens a new one.
async function openPaymentSite(payment) {
  const tabs = (await chrome.tabs.query({ url: matchPatterns(payment.domain) }))
    .filter((t) => domainFromUrl(t.url) === payment.domain);
  const win = await chrome.windows.getCurrent();
  const tab = tabs.find((t) => t.windowId === win.id && t.active)
    ?? tabs.find((t) => t.windowId === win.id)
    ?? tabs[0];
  if (!tab) {
    await chrome.tabs.create({ url: payment.url });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== win.id) await chrome.windows.update(tab.windowId, { focused: true });
}

function gearButton(payment) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gear';
  btn.title = `Configurar ${displayName(payment)}`;
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = GEAR_SVG;
  btn.addEventListener('click', () => openSiteSettings(payment.id));
  return btn;
}

function renderItem(payment, { month } = {}) {
  const li = document.createElement('li');
  if (payment.id === currentPayment?.id) li.classList.add('current');

  const info = document.createElement('div');
  info.className = 'info';
  const link = document.createElement('a');
  link.href = payment.url;
  link.textContent = displayName(payment);
  link.addEventListener('click', (e) => {
    e.preventDefault();
    openPaymentSite(payment);
  });
  info.append(link);

  if (payment.alias) {
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = payment.domain;
    info.append(sub);
  }

  const row = document.createElement('div');
  row.className = 'check';
  const end = document.createElement('div');
  end.className = 'end';

  if (month) {
    // Monthly checklist row: checkbox to mark it paid by hand (e.g. paid outside the browser).
    const paid = isPaid(payment, month);
    if (paid) li.classList.add('paid');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = paid;
    checkbox.title = paid ? 'Marcar como pendiente' : 'Marcar como pagado';
    checkbox.addEventListener('change', () => setPaid(payment.id, checkbox.checked, month));
    row.append(checkbox);

    const state = document.createElement('span');
    state.className = `state ${paid ? 'done' : 'pending'}`;
    state.textContent = paid ? 'Pagado' : 'Pendiente';
    end.append(state);
  }

  row.append(info);
  end.append(gearButton(payment));
  li.append(row, end);
  return li;
}

function renderList(el, payments, options) {
  el.replaceChildren();
  if (payments.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Sin pagos guardados.';
    el.append(empty);
    return;
  }
  // Alphabetical only, so rows don't jump around when marked as paid.
  const sorted = [...payments].sort((a, b) => displayName(a).localeCompare(displayName(b), 'es', { sensitivity: 'base' }));
  el.append(...sorted.map((p) => renderItem(p, options)));
}

function renderProgress(payments) {
  const total = payments.length;
  const paid = payments.filter((p) => isPaid(p, viewMonth)).length;
  $('month-progress').hidden = total === 0;
  $('month-progress').querySelector('.progress-text').textContent = paid === total
    ? `✅ Todo pagado (${paid}/${total})`
    : `${paid} de ${total} pagados · ${total - paid} pendientes`;
  $('month-progress').querySelector('.progress-fill').style.width = `${total ? (paid / total) * 100 : 0}%`;
}

async function renderLists() {
  const payments = await getPayments();
  const monthly = monthlyPaymentsFor(payments, viewMonth);
  $('month-label').textContent = monthLabel(viewMonth);
  $('month-next').disabled = viewMonth >= startOfMonth(new Date());
  renderProgress(monthly);
  renderList($('list-monthly'), monthly, { month: viewMonth });
  renderList($('list-once'), payments.filter((p) => p.type === 'once'));
}

function shiftMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderLists();
}

$('month-prev').addEventListener('click', () => shiftMonth(-1));
$('month-next').addEventListener('click', () => shiftMonth(1));

async function render() {
  showError('');
  await renderCurrent();
  await renderLists();
  if (settingsId) await renderSiteSettings();
}

// Must run directly from a click: Chrome only shows the permission prompt on a user gesture.
function requestSitePermission(domain) {
  return chrome.permissions.request({ origins: matchPatterns(domain) }).catch(() => false);
}

$('add-btn').addEventListener('click', () => {
  $('save-form').hidden = false;
  $('add-btn').hidden = true;
  $('alias').focus();
});

$('add-cancel').addEventListener('click', () => {
  $('save-form').hidden = true;
  $('add-btn').hidden = false;
  $('alias').value = '';
  showError('');
});

$('save-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { type } = e.submitter.dataset;
  const domain = domainFromUrl(currentUrl);
  try {
    // Saved even if the permission is denied; the border can be enabled later in settings.
    await requestSitePermission(domain);
    await addPayment({ url: currentUrl, alias: $('alias').value, type });
    $('alias').value = '';
  } catch (err) {
    showError(err.message);
  }
});

$('receipt-btn').addEventListener('click', async () => {
  const payment = currentPayment;
  const tab = currentTab;
  $('receipt-btn').disabled = true;
  $('capture-help').hidden = true;
  try {
    if (!rootHandle) {
      rootHandle = await chooseRootFolder();
      renderFolder();
      if (!rootHandle) return;
    }
    if (!(await ensureWritePermission(rootHandle))) {
      throw new Error('Sin permiso para escribir en la carpeta.');
    }
    setReceiptStatus('Guardando…');
    const blob = await captureTab(tab);
    const path = await saveReceipt(rootHandle, payment, blob, 'png');
    await markPaid(payment.id);
    setReceiptStatus(`✅ Guardado en ${path}`, 'ok');
  } catch (err) {
    if (/activeTab|all_urls/.test(err.message)) {
      setReceiptStatus('');
      $('capture-help').hidden = false;
      return;
    }
    const message = err.name === 'NotFoundError'
      ? 'La carpeta ya no existe. Elige otra en la configuración.'
      : `No se pudo guardar: ${err.message}`;
    setReceiptStatus(message, 'error');
  } finally {
    $('receipt-btn').disabled = false;
  }
});

$('capture-settings-btn').addEventListener('click', () => {
  if (currentPayment) openSiteSettings(currentPayment.id);
});

// --- Site settings -----------------------------------------------------------

async function renderSiteSettings({ resetForm = false } = {}) {
  const payment = await findById(settingsId);
  if (!payment) {
    openMain(); // Deleted.
    return;
  }
  settingsPayment = payment;
  $('site-name').textContent = displayName(payment);
  $('site-domain').textContent = payment.domain;
  if (resetForm) {
    $('site-alias').value = payment.alias;
    $('site-type').value = payment.type;
    resetDeleteButton();
  }
  $('site-border').checked = payment.showBorder !== false && await hasSitePermission(payment.domain);
  $('site-capture').checked = await chrome.permissions.contains(ALL_SITES);
}

$('site-alias-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await updatePayment(settingsId, { alias: $('site-alias').value.trim(), type: $('site-type').value });
  openMain();
});

$('site-border').addEventListener('change', async (e) => {
  const payment = settingsPayment;
  if (!e.target.checked) {
    await updatePayment(payment.id, { showBorder: false });
    return;
  }
  // Ask first, while the click still counts as a user gesture.
  const granted = await requestSitePermission(payment.domain);
  if (granted) await updatePayment(payment.id, { showBorder: true });
  else e.target.checked = false;
});

$('site-capture').addEventListener('change', async (e) => {
  if (e.target.checked) {
    e.target.checked = await chrome.permissions.request(ALL_SITES).catch(() => false);
  } else {
    await chrome.permissions.remove(ALL_SITES).catch(() => {});
  }
});

function resetDeleteButton() {
  delete $('site-delete').dataset.confirm;
  $('site-delete').textContent = 'Eliminar sitio';
}

$('site-delete').addEventListener('click', async () => {
  if ($('site-delete').dataset.confirm) {
    await removePayment(settingsId);
    openMain();
    return;
  }
  $('site-delete').dataset.confirm = '1';
  $('site-delete').textContent = '¿Seguro? Pulsa otra vez';
  setTimeout(resetDeleteButton, 3000);
});

// --- General settings --------------------------------------------------------

function renderFolder() {
  $('folder-name').textContent = rootHandle ? rootHandle.name : 'Sin elegir';
  $('folder-btn').textContent = rootHandle ? 'Cambiar' : 'Elegir';
}

$('folder-btn').addEventListener('click', async () => {
  try {
    rootHandle = (await chooseRootFolder()) ?? rootHandle;
    renderFolder();
    await movePendingPdfs({ interactive: true });
  } catch (err) {
    showError(err.message);
  }
});

$('shortcuts-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// --- Receipts captured outside the panel: downloaded PDFs and menu/shortcut screenshots ---

// PDFs already handled in this session, shown until the panel closes.
const movedPdfs = [];
let movingPdfs = false;

function pdfRow(title, detail, kind, onDismiss) {
  const li = document.createElement('li');
  const text = document.createElement('div');
  text.className = 'text';
  const name = document.createElement('div');
  name.textContent = title;
  const sub = document.createElement('div');
  sub.className = `sub ${kind}`;
  sub.textContent = detail;
  text.append(name, sub);
  li.append(text);
  if (onDismiss) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon';
    btn.textContent = '×';
    btn.title = 'Descartar';
    btn.addEventListener('click', onDismiss);
    li.append(btn);
  }
  return li;
}

async function renderPdfs(needsPermission = false) {
  const pending = await getPendingPdfs();
  const rows = [];
  for (const item of pending) {
    const payment = await findById(item.paymentId);
    const who = payment ? displayName(payment) : 'sitio eliminado';
    if (item.error) {
      const where = typeof item.id === 'number' ? ' Quedó en Descargas.' : '';
      rows.push(pdfRow(item.filename, `${who}: ${item.error}${where}`, 'error',
        () => deletePendingPdf(item.id).then(() => renderPdfs())));
    } else {
      const detail = !rootHandle ? `${who}: elige una carpeta en la configuración.`
        : needsPermission ? `${who}: pendiente de mover.` : `${who}: moviendo…`;
      rows.push(pdfRow(item.filename, detail, ''));
    }
  }
  for (const moved of movedPdfs) rows.push(pdfRow(moved.filename, `✅ ${moved.path}`, 'ok'));

  $('pdf-list').replaceChildren(...rows);
  $('pdfs').hidden = rows.length === 0;
  $('pdf-move-btn').hidden = !(needsPermission && pending.some((i) => i.blob));
}

// interactive: called from a click, so the folder permission prompt can be shown.
async function movePendingPdfs({ interactive = false } = {}) {
  if (movingPdfs) return;
  movingPdfs = true;
  try {
    const pending = (await getPendingPdfs()).filter((i) => i.blob);
    if (pending.length === 0 || !rootHandle) return;

    const granted = interactive
      ? await ensureWritePermission(rootHandle)
      : (await rootHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
    if (!granted) {
      await renderPdfs(true);
      return;
    }

    for (const item of pending) {
      const payment = await findById(item.paymentId);
      if (!payment) {
        await deletePendingPdf(item.id);
        continue;
      }
      const date = new Date(item.createdAt);
      try {
        const path = await saveFile(rootHandle, payment, item.blob, item.filename, date);
        await markPaid(payment.id, date);
        // Downloads are moved: drop the copy left in Downloads.
        if (typeof item.id === 'number') {
          await chrome.downloads.removeFile(item.id).catch(() => {});
          await chrome.downloads.erase({ id: item.id }).catch(() => {});
        }
        await deletePendingPdf(item.id);
        movedPdfs.unshift({ filename: item.filename, path });
      } catch (err) {
        await deletePendingPdf(item.id);
        await addPendingPdfError(item, err);
      }
    }
  } finally {
    movingPdfs = false;
    await renderPdfs();
  }
}

async function addPendingPdfError(item, err) {
  const { blob, ...rest } = item;
  await addPendingPdf({ ...rest, error: `No se pudo guardar (${err.message}).` });
}

$('pdf-move-btn').addEventListener('click', () => movePendingPdfs({ interactive: true }));

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'pending-pdfs') movePendingPdfs();
});

// --- Live updates ------------------------------------------------------------

chrome.tabs.onActivated.addListener(render);
chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (tab.active && info.url) render();
});
chrome.windows.onFocusChanged.addListener(render);
chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.payments) render();
});

getRootHandle()
  .then((handle) => { rootHandle = handle ?? null; })
  .catch(() => {})
  .finally(() => {
    renderFolder();
    movePendingPdfs();
  });
render();
