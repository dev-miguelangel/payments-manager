import {
  addPayment,
  addReceipt,
  backupData,
  backupProblem,
  amountFor,
  displayName,
  domainFromUrl,
  dueStatus,
  findAllByDomain,
  findById,
  folderName,
  formatAmount,
  frequencyLabel,
  getPayments,
  getSettings,
  hasSitePermission,
  isPaid,
  isPaused,
  latestReceipt,
  markPaid,
  matchPatterns,
  monthFromKey,
  monthKey,
  monthLabel,
  monthTotal,
  nameProblem,
  nextDueMonth,
  parseAmount,
  pauseChanges,
  paymentHistory,
  previousAmount,
  receiptsFor,
  recurringPaymentsFor,
  shortName,
  shouldSuggestArchive,
  removePayment,
  restoreBackup,
  setAmount,
  setPaid,
  setReceipts,
  updateDomain,
  updatePayment,
  updateSettings,
} from './lib/storage.js';
import { captureTab } from './lib/capture.js';
import { checkPassword, lockNow, passwordProblem, reloadOnLock, requireUnlock, setPassword, trackPanel } from './lib/lock.js';
import {
  addPendingPdf,
  chooseRootFolder,
  deletePendingPdf,
  ensureWritePermission,
  getPendingPdfs,
  getRootHandle,
  listReceipts,
  readReceipt,
  saveFile,
  pickBackupFile,
  saveBackup,
  saveReceipt,
} from './lib/files.js';

const $ = (id) => document.getElementById(id);

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;
$('general-btn').innerHTML = GEAR_SVG;

const CHART_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 3v18h18"/><path d="M8 17v-5"/><path d="M13 17V8"/><path d="M18 17v-8"/>
</svg>`;
$('summary-btn').innerHTML = CHART_SVG;

const ALL_SITES = { origins: ['<all_urls>'] };

let currentTab = null;
let currentUrl = null;
let currentDomain = null;
// Last loaded list, for checks that must run synchronously inside a click.
let allPayments = [];
let settings = null;
// Row showing the amount field right after marking it paid: { id, key }.
let amountPrompt = null;
// Payments saved for the current tab's site (a site can have several).
let currentPayments = [];
let rootHandle = null;
// Payment whose settings are open, or null.
let settingsId = null;
let settingsPayment = null;
// Nothing renders until the password is entered.
let locked = true;
// First day of the month shown in the recurring checklist.
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
  historyEdit = null;
  renderSiteSettings({ resetForm: true });
  showView('site');
}

function openMain() {
  settingsId = null;
  showView('main');
}

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', openMain));
// Opens the summary for the month shown in the checklist; the period is chosen on the page.
let summaryNoticeTimer = null;

$('summary-btn').addEventListener('click', async () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`summary.html?months=1&end=${monthKey(viewMonth)}`) });
  // Chrome can't load extension pages in incognito tabs, so it opens the summary in a normal window.
  const { incognito } = await chrome.windows.getCurrent();
  $('summary-notice').hidden = !incognito;
  if (!incognito) return;
  $('summary-notice').textContent = 'El resumen se abrió en otra ventana: Chrome no permite abrirlo en una ventana de incógnito.';
  clearTimeout(summaryNoticeTimer);
  summaryNoticeTimer = setTimeout(() => { $('summary-notice').hidden = true; }, 8000);
});
$('general-btn').addEventListener('click', () => {
  renderGeneralSettings();
  showView('general');
});

// --- Main view -------------------------------------------------------------

async function renderCurrent() {
  currentTab = await getActiveTab();
  currentUrl = currentTab?.url ?? null;
  const domain = currentUrl && domainFromUrl(currentUrl);
  const previousIds = currentPayments.map((p) => p.id).join();
  currentPayments = domain ? await findAllByDomain(domain) : [];
  currentPayments.sort(byName);
  if (domain !== currentDomain) {
    setReceiptStatus('');
    $('receipt-amount').replaceChildren();
    $('capture-help').hidden = true;
    $('save-form').hidden = true;
  }
  // A payment was just added here: close the form.
  if (currentPayments.map((p) => p.id).join() !== previousIds && domain === currentDomain) {
    $('save-form').hidden = true;
  }
  currentDomain = domain;

  $('receipt-box').hidden = currentPayments.length === 0;
  renderReceiptButtons();
  renderCurrentFields();

  $('add-btn').hidden = !domain || !$('save-form').hidden;
  $('add-btn').textContent = currentPayments.length ? '+ Agregar otro pago en este sitio' : '+ Agregar este sitio';
  $('add-domain').textContent = domain ?? '';
  $('alias').placeholder = currentPayments.length ? 'Obligatorio: Ej. Agua, Gas…' : 'Ej: Luz, Arriendo…';
}

const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'es', { sensitivity: 'base' });

// Data of the payments on this site (Nº cliente, cuenta…) with copy buttons, for paying.
function renderCurrentFields() {
  const multi = currentPayments.length > 1;
  const groups = currentPayments
    .filter((p) => p.fields.some((f) => f.value) || p.note)
    .map((payment) => {
      const group = document.createElement('div');
      group.className = 'data-group';
      if (multi) {
        const title = document.createElement('div');
        title.className = 'label';
        title.textContent = shortName(payment);
        group.append(title);
      }
      for (const field of payment.fields.filter((f) => f.value)) {
        const row = document.createElement('div');
        row.className = 'data-row';
        const k = document.createElement('span');
        k.className = 'k';
        k.textContent = field.label || 'Dato';
        const v = document.createElement('span');
        v.className = 'v';
        v.textContent = field.value;
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'secondary';
        copy.textContent = '📋 Copiar';
        copy.title = `Copiar ${field.label || 'dato'}`;
        copy.addEventListener('click', async () => {
          await navigator.clipboard.writeText(field.value);
          copy.textContent = '✓ Copiado';
          setTimeout(() => { copy.textContent = '📋 Copiar'; }, 1500);
        });
        row.append(k, v, copy);
        group.append(row);
      }
      if (payment.note) {
        const note = document.createElement('p');
        note.className = 'data-note';
        note.textContent = payment.note;
        group.append(note);
      }
      return group;
    });
  $('current-fields').replaceChildren(...groups);
}

// One button when the site has one payment; one per payment when it has several.
function renderReceiptButtons() {
  const multi = currentPayments.length > 1;
  $('receipt-label').hidden = !multi;
  $('receipt-buttons').replaceChildren(...currentPayments.map((payment) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = multi ? '' : 'receipt';
    btn.textContent = multi ? shortName(payment) : '📸 Guardar comprobante';
    btn.addEventListener('click', () => saveReceiptFor(payment, btn));
    return btn;
  }));
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

// Inline "$ [____] ✓ ×" field. Suggests last month's amount; empty means "no amount".
function amountEditor(payment, month, onClose) {
  const form = document.createElement('form');
  form.className = 'amount-editor';
  const input = document.createElement('input');
  input.inputMode = 'numeric';
  const current = amountFor(payment, month);
  const previous = previousAmount(payment, month);
  input.value = current != null ? formatAmount(current) : '';
  input.placeholder = previous != null ? `Monto · antes ${formatAmount(previous)}` : 'Monto pagado (opcional)';
  input.setAttribute('aria-label', `Monto pagado en ${displayName(payment)}`);
  // Live thousands separators while typing.
  input.addEventListener('input', () => {
    const amount = parseAmount(input.value);
    input.value = amount != null ? formatAmount(amount) : '';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose();
  });
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = '✓';
  save.title = 'Guardar monto';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'secondary';
  skip.textContent = '×';
  skip.title = current != null ? 'Dejar este monto' : 'Sin monto';
  skip.addEventListener('click', onClose);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseAmount(input.value);
    if (amount != null) await setAmount(payment.id, amount, month);
    onClose();
  });
  form.append(input, save, skip);
  setTimeout(() => input.focus());
  return form;
}

const isPrompted = (payment, month) => amountPrompt?.id === payment.id && amountPrompt.key === monthKey(month);

// month: render as a checklist row for that month. note: grey line under the name.
function renderItem(payment, { month, note } = {}) {
  const li = document.createElement('li');
  if (payment.domain === currentDomain) li.classList.add('current');

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
  if (payment.type === 'recurring' && payment.frequency !== 1) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = frequencyLabel(payment);
    info.append(tag);
  }

  const subText = note;
  if (subText) {
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = subText;
    info.append(sub);
  }

  const row = document.createElement('div');
  row.className = 'check';
  const end = document.createElement('div');
  end.className = 'end';

  if (month) {
    // Monthly checklist row: checkbox to mark it paid by hand (e.g. paid outside the browser).
    const paid = isPaid(payment, month);
    const status = dueStatus(payment, month, settings);
    if (paid) li.classList.add('paid');
    if (status.kind === 'overdue') li.classList.add('overdue');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = paid;
    checkbox.title = paid ? 'Marcar como pendiente' : 'Marcar como pagado';
    checkbox.addEventListener('change', () => {
      // Ask for the amount right after marking it paid.
      amountPrompt = checkbox.checked ? { id: payment.id, key: monthKey(month) } : null;
      setPaid(payment.id, checkbox.checked, month);
    });
    row.append(checkbox);

    const state = document.createElement('span');
    state.className = `state ${status.kind}`;
    const amount = amountFor(payment, month);
    state.textContent = paid && amount != null ? `Pagado · ${formatAmount(amount)}` : status.text;
    if (paid) {
      // Click a paid state to add or fix the amount.
      state.classList.add('clickable');
      state.title = amount != null ? 'Editar monto' : 'Agregar monto';
      state.addEventListener('click', () => {
        amountPrompt = { id: payment.id, key: monthKey(month) };
        renderLists();
      });
    }
    end.append(state);
  }

  row.append(info);
  // 📎: newest receipt of this month (recurring) or ever (one-off).
  const receipt = month ? receiptsFor(payment, month).at(-1) : latestReceipt(payment);
  if (receipt) {
    const count = month ? receiptsFor(payment, month).length : 1;
    const clip = document.createElement('button');
    clip.type = 'button';
    clip.className = 'clip';
    clip.textContent = '📎';
    clip.title = count > 1 ? `Abrir el último de ${count} comprobantes` : `Abrir ${receipt.name}`;
    clip.addEventListener('click', () => openReceipt(receipt));
    end.append(clip);
  }
  if (shouldSuggestArchive(payment)) {
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'secondary suggest';
    archive.textContent = '¿Archivar?';
    archive.title = 'Pagado hace más de 60 días';
    archive.addEventListener('click', () => updatePayment(payment.id, { archived: true }));
    end.append(archive);
  }
  end.append(gearButton(payment));
  li.append(row, end);
  if (month && isPrompted(payment, month) && isPaid(payment, month)) {
    li.append(amountEditor(payment, month, () => {
      amountPrompt = null;
      renderLists();
    }));
  }
  return li;
}

// noteFor(payment): optional grey line under each name.
function renderList(el, payments, { emptyText = 'Sin pagos guardados.', noteFor, ...options } = {}) {
  el.replaceChildren();
  if (payments.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = emptyText;
    el.append(empty);
    return;
  }
  // Alphabetical only, so rows don't jump around when marked as paid.
  const sorted = [...payments].sort(byName);
  el.append(...sorted.map((p) => renderItem(p, { ...options, note: noteFor?.(p) })));
}

// A collapsible section that's hidden when empty.
function renderFold(id, listId, title, payments, noteFor) {
  $(id).hidden = payments.length === 0;
  $(id).querySelector('summary').textContent = `${title} (${payments.length})`;
  renderList($(listId), payments, { noteFor });
}

function renderProgress(payments, spent) {
  const total = payments.length;
  const paid = payments.filter((p) => isPaid(p, viewMonth)).length;
  $('month-progress').hidden = total === 0 && spent === 0;
  const money = spent ? ` · ${formatAmount(spent)}` : '';
  $('month-progress').querySelector('.progress-text').textContent = total === 0
    ? `Pagado este mes${money}`
    : paid === total
      ? `✅ Todo pagado (${paid}/${total})${money}`
      : `${paid} de ${total} pagados · ${total - paid} pendientes${money}`;
  $('month-progress').querySelector('.progress-fill').style.width = `${total ? (paid / total) * 100 : 0}%`;
}

async function renderLists() {
  const payments = await getPayments();
  allPayments = payments;
  settings = await getSettings();
  const due = recurringPaymentsFor(payments, viewMonth);
  const recurring = payments.filter((p) => p.type === 'recurring');
  const viewKey = monthKey(viewMonth);
  // Recurring payments that exist in this month but aren't due in it (e.g. yearly ones).
  const notDue = recurring.filter((p) => !due.includes(p) && !isPaused(p, viewMonth) && p.startMonth <= viewKey);
  const paused = recurring.filter((p) => isPaused(p));
  const once = payments.filter((p) => p.type === 'once');

  $('month-label').textContent = monthLabel(viewMonth);
  $('month-next').disabled = viewMonth >= startOfMonth(new Date());
  renderProgress(due, monthTotal(payments, viewMonth));
  renderList($('list-monthly'), due, {
    month: viewMonth,
    emptyText: recurring.length ? 'Ningún pago corresponde este mes.' : 'Sin pagos guardados.',
  });
  renderFold('not-due', 'list-not-due', `No corresponden en ${monthLabel(viewMonth)}`, notDue, (p) => {
    const next = nextDueMonth(p, viewMonth);
    return next ? `Próximo: ${monthLabel(next)}` : null;
  });
  renderList($('list-once'), once.filter((p) => !p.archived));
  renderFold('inactive', 'list-inactive', 'Archivados y pausados',
    [...once.filter((p) => p.archived), ...paused],
    (p) => (p.archived ? 'Archivado' : `Pausado desde ${monthLabel(monthFromKey(p.endMonth))}`));
}

function shiftMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderLists();
}

$('month-prev').addEventListener('click', () => shiftMonth(-1));
$('month-next').addEventListener('click', () => shiftMonth(1));

async function render() {
  if (locked) return;
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

// Live thousands separators while typing a fixed amount.
for (const id of ['add-amount', 'site-amount']) {
  $(id).addEventListener('input', (e) => {
    const amount = parseAmount(e.target.value);
    e.target.value = amount != null ? formatAmount(amount) : '';
  });
}

$('add-cancel').addEventListener('click', () => {
  $('save-form').hidden = true;
  $('add-btn').hidden = false;
  $('alias').value = '';
  $('add-amount').value = '';
  showError('');
});

$('save-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { type } = e.submitter.dataset;
  const domain = domainFromUrl(currentUrl);
  // Check the name before the permission prompt (which must come first, while it's a click).
  const problem = nameProblem(allPayments, { domain, alias: $('alias').value });
  if (problem) {
    showError(problem);
    return;
  }
  try {
    // Saved even if the permission is denied; the border can be enabled later in settings.
    await requestSitePermission(domain);
    await addPayment({ url: currentUrl, alias: $('alias').value, type, defaultAmount: parseAmount($('add-amount').value) });
    $('alias').value = '';
    $('add-amount').value = '';
  } catch (err) {
    showError(err.message);
  }
});

// After saving a receipt: "$ [____]" for what was paid, unless it already has an amount
// other than the fixed one (which is shown prefilled to confirm or change).
async function showReceiptAmount(payment, date = new Date()) {
  const fresh = await findById(payment.id);
  const amount = fresh && amountFor(fresh, date);
  if (!fresh || (amount != null && amount !== fresh.defaultAmount)) return;
  $('receipt-amount').replaceChildren(amountEditor(fresh, date, () => $('receipt-amount').replaceChildren()));
}

async function saveReceiptFor(payment, btn) {
  const tab = currentTab;
  btn.disabled = true;
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
    const { path, dir, name } = await saveReceipt(rootHandle, payment, blob, 'png');
    await addReceipt(payment.id, { dir, name });
    await markPaid(payment.id);
    setReceiptStatus(`✅ ${displayName(payment)}: guardado en ${path}`, 'ok');
    showReceiptAmount(payment);
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
    btn.disabled = false;
  }
}

$('capture-settings-btn').addEventListener('click', () => {
  if (currentPayments.length) openSiteSettings(currentPayments[0].id);
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
  // The title already includes the domain ("banco.itau.cl.CC").
  $('site-domain').hidden = true;
  if (resetForm) {
    $('site-alias').value = payment.alias;
    $('site-type').value = payment.type === 'recurring' ? String(payment.frequency) : 'once';
    $('site-start').value = payment.startMonth;
    $('site-due').value = payment.dueDay ?? '';
    $('site-amount').value = payment.defaultAmount != null ? formatAmount(payment.defaultAmount) : '';
    $('site-error').hidden = true;
    renderStartHint();
    renderFieldsEditor(payment);
    loadReceipts(payment);
    $('site-note').value = payment.note;
    resetDeleteButton();
  }
  renderStateCard(payment);
  renderHistory(payment);
  const siblings = (await findAllByDomain(payment.domain)).length - 1;
  const shared = siblings === 1 ? ` Se aplica también al otro pago de ${payment.domain}.`
    : siblings > 1 ? ` Se aplica también a los otros ${siblings} pagos de ${payment.domain}.` : '';
  $('site-border-help').textContent = `Marca la página cuando estás en este sitio.${shared}`;
  $('site-border').checked = payment.showBorder !== false && await hasSitePermission(payment.domain);
  $('site-capture').checked = await chrome.permissions.contains(ALL_SITES);
}

$('site-alias-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alias = $('site-alias').value.trim();
  const problem = nameProblem(await getPayments(), { domain: settingsPayment.domain, alias, id: settingsId });
  if (problem) {
    $('site-error').textContent = problem;
    $('site-error').hidden = false;
    return;
  }
  const kind = $('site-type').value;
  const dueDay = Number($('site-due').value);
  // Keep the old folder name so receipts saved under it are still found.
  const oldFolder = folderName(settingsPayment);
  const newFolder = folderName({ ...settingsPayment, alias });
  const pastFolders = oldFolder !== newFolder
    ? [...new Set([...settingsPayment.pastFolders, oldFolder])].filter((f) => f !== newFolder)
    : settingsPayment.pastFolders;
  await updatePayment(settingsId, kind === 'once'
    ? { alias, type: 'once', pastFolders }
    : {
      alias,
      pastFolders,
      type: 'recurring',
      frequency: Number(kind),
      startMonth: $('site-start').value || settingsPayment.startMonth,
      dueDay: dueDay >= 1 && dueDay <= 31 ? Math.round(dueDay) : null,
      defaultAmount: parseAmount($('site-amount').value),
    });
  openMain();
});

$('site-border').addEventListener('change', async (e) => {
  const payment = settingsPayment;
  // The border is per site, so it applies to every payment on the domain.
  if (!e.target.checked) {
    await updateDomain(payment.domain, { showBorder: false });
    return;
  }
  // Ask first, while the click still counts as a user gesture.
  const granted = await requestSitePermission(payment.domain);
  if (granted) await updateDomain(payment.domain, { showBorder: true });
  else e.target.checked = false;
});

$('site-capture').addEventListener('change', async (e) => {
  if (e.target.checked) {
    e.target.checked = await chrome.permissions.request(ALL_SITES).catch(() => false);
  } else {
    await chrome.permissions.remove(ALL_SITES).catch(() => {});
  }
});

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => monthLabel(new Date(2000, i, 1)).split(' ')[0]);

// "Corresponde en: Octubre, Enero, Abril y Julio".
function renderStartHint() {
  const kind = $('site-type').value;
  $('site-start-row').hidden = kind === 'once';
  $('site-due-row').hidden = kind === 'once';
  $('site-amount-row').hidden = kind === 'once';
  const start = $('site-start').value;
  if (kind === 'once' || !start) return;
  const frequency = Number(kind);
  const first = monthFromKey(start).getMonth();
  const months = Array.from({ length: 12 / frequency }, (_, i) => MONTH_NAMES[(first + i * frequency) % 12]);
  $('site-start-hint').textContent = frequency === 1
    ? `Aparece todos los meses desde ${monthLabel(monthFromKey(start))}.`
    : `Corresponde en: ${months.length > 1 ? `${months.slice(0, -1).join(', ')} y ${months.at(-1)}` : months[0]}.`;
}

$('site-type').addEventListener('change', renderStartHint);
$('site-start').addEventListener('input', renderStartHint);

// Pause/resume for recurring payments, archive/unarchive for one-off ones.
function renderStateCard(payment) {
  const recurring = payment.type === 'recurring';
  $('site-pause').hidden = !recurring;
  $('site-archive').hidden = recurring;
  if (recurring) {
    const paused = isPaused(payment);
    // Paused from next month (this month was already paid).
    const scheduled = Boolean(payment.endMonth) && !paused;
    const next = nextDueMonth(payment);
    const from = payment.endMonth && monthLabel(monthFromKey(payment.endMonth));
    $('site-state').textContent = paused ? `⏸ Pausado desde ${from}. No aparece en la lista.`
      : scheduled ? `${frequencyLabel(payment)} · se pausa desde ${from}.`
        : `${frequencyLabel(payment)}${next ? ` · próximo: ${monthLabel(next)}` : ''}`;
    $('site-pause').textContent = paused ? '▶ Reanudar'
      : scheduled ? 'Cancelar la pausa'
        : isPaid(payment) ? '⏸ Pausar desde el próximo mes' : '⏸ Pausar desde este mes';
  } else {
    $('site-state').textContent = payment.archived ? '📦 Archivado.' : 'Pago único.';
    $('site-archive').textContent = payment.archived ? 'Desarchivar' : '📦 Archivar';
  }
}

$('site-pause').addEventListener('click', () => {
  const payment = settingsPayment;
  updatePayment(payment.id, payment.endMonth ? { endMonth: null } : pauseChanges(payment));
});

$('site-archive').addEventListener('click', () => {
  updatePayment(settingsPayment.id, { archived: !settingsPayment.archived });
});

// --- Receipts in the folder ---

// Opens a receipt in a new tab. Needs the folder permission, so call it from a click.
async function openReceipt(entry) {
  showError('');
  try {
    if (!rootHandle) throw new Error('Elige la carpeta de comprobantes en la configuración general.');
    if (!(await ensureWritePermission(rootHandle))) throw new Error('Sin permiso para leer la carpeta.');
    const file = await readReceipt(rootHandle, entry);
    await chrome.tabs.create({ url: URL.createObjectURL(file) });
  } catch (err) {
    const message = err.name === 'NotFoundError'
      ? `No se encontró ${entry.name}: puede que se haya movido o borrado.`
      : err.message;
    if (settingsId) $('receipts-msg').textContent = message;
    else showError(message);
  }
}

const fileIcon = (name) => (/\.pdf$/i.test(name) ? '📄' : /\.(png|jpe?g|webp|gif|heic)$/i.test(name) ? '🖼' : '📎');

// interactive: from a click, so Chrome can ask for the folder permission again.
async function loadReceipts(payment, { interactive = false } = {}) {
  $('receipts-list').replaceChildren();
  $('receipts-load').hidden = true;
  if (!rootHandle) {
    $('receipts-msg').textContent = 'Elige la carpeta de comprobantes en la configuración general.';
    return;
  }
  const granted = interactive
    ? await ensureWritePermission(rootHandle)
    : (await rootHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
  if (!granted) {
    $('receipts-msg').textContent = 'Chrome necesita permiso para leer la carpeta.';
    $('receipts-load').hidden = false;
    return;
  }

  $('receipts-msg').textContent = 'Buscando…';
  let files;
  try {
    files = await listReceipts(rootHandle, payment);
  } catch (err) {
    $('receipts-msg').textContent = `No se pudo leer la carpeta: ${err.message}`;
    return;
  }
  if (settingsId !== payment.id) return; // Closed or switched while scanning.
  $('receipts-msg').textContent = files.length ? '' : 'Todavía no hay comprobantes guardados.';

  const byMonth = Map.groupBy(files, (f) => f.month);
  $('receipts-list').replaceChildren(...[...byMonth].flatMap(([month, list]) => {
    const title = document.createElement('div');
    title.className = 'receipt-month';
    title.textContent = monthLabel(monthFromKey(month));
    return [title, ...list.map((file) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${fileIcon(file.name)} ${file.name}`;
      btn.title = `Pagos/${file.dir}/${file.name}`;
      btn.addEventListener('click', () => openReceipt(file));
      return btn;
    })];
  }));

  // Sync the 📎 index with what's really on disk (picks up old or hand-copied files).
  const index = {};
  for (const file of [...files].reverse()) (index[file.month] ??= []).push({ dir: file.dir, name: file.name });
  if (JSON.stringify(index) !== JSON.stringify(payment.receipts)) await setReceipts(payment.id, index);
}

$('receipts-load').addEventListener('click', () => loadReceipts(settingsPayment, { interactive: true }));

// --- Data fields (Nº cliente, cuenta…) and note ---

// Rows are built when the settings open (not on every re-render) so typing isn't interrupted.
function renderFieldsEditor(payment) {
  $('site-fields').replaceChildren(...payment.fields.map((field) => fieldRow(field)));
}

function fieldRow(field) {
  const row = document.createElement('div');
  row.className = 'field-row';
  const label = document.createElement('input');
  label.className = 'field-label';
  label.placeholder = 'Ej: Nº cliente';
  label.value = field.label;
  label.setAttribute('list', 'field-labels');
  label.setAttribute('aria-label', 'Nombre del dato');
  const value = document.createElement('input');
  value.placeholder = 'Valor';
  value.value = field.value;
  value.setAttribute('aria-label', 'Valor del dato');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon';
  remove.textContent = '×';
  remove.title = 'Quitar dato';
  label.addEventListener('change', () => saveFields());
  value.addEventListener('change', () => saveFields());
  remove.addEventListener('click', async () => {
    row.remove();
    await saveFields();
  });
  row.append(label, value, remove);
  return row;
}

// Reads the editor rows and saves them (empty rows are dropped).
function saveFields() {
  const fields = [...$('site-fields').querySelectorAll('.field-row')]
    .map((row) => {
      const [label, value] = row.querySelectorAll('input');
      return { label: label.value.trim(), value: value.value.trim() };
    })
    .filter((f) => f.label || f.value);
  return updatePayment(settingsId, { fields });
}

$('site-field-add').addEventListener('click', () => {
  const row = fieldRow({ label: '', value: '' });
  $('site-fields').append(row);
  row.querySelector('input').focus();
});

$('site-note').addEventListener('change', (e) => updatePayment(settingsId, { note: e.target.value.trim() }));

// --- History: bar chart + list of the last 12 months ---

let historyEdit = null; // monthKey being edited in the history list

function renderHistory(payment) {
  const rows = paymentHistory(payment);
  $('history-card').hidden = rows.length === 0;
  if (rows.length === 0) return;

  const amounts = rows.map((r) => r.record?.amount ?? null);
  const max = Math.max(0, ...amounts.filter((a) => a != null));
  $('history-max').textContent = max ? `máx. ${formatAmount(max)}` : '';

  // Single series: one hue, no legend; the list below is the table view.
  const chart = $('history-chart');
  // No amounts yet: just the list, no empty chart.
  chart.hidden = !max;
  chart.parentElement.querySelectorAll('.chart-axis').forEach((el) => el.remove());
  chart.replaceChildren(...rows.map(({ month, record }) => {
    const col = document.createElement('div');
    col.className = 'col';
    const amount = record?.amount;
    col.dataset.tip = `${monthLabel(month)}: ${amount != null ? formatAmount(amount) : record?.paid ? 'pagado, sin monto' : 'sin pagar'}`;
    if (amount != null && max) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${Math.max(4, (amount / max) * 100)}%`;
      col.append(bar);
    }
    return col;
  }));
  chart.setAttribute('aria-label', rows.map(({ month, record }) =>
    `${monthLabel(month)} ${record?.amount != null ? formatAmount(record.amount) : 'sin monto'}`).join(', '));

  // Month initials under the bars.
  if (!max) return renderHistoryList(payment, rows, amounts);
  const axis = document.createElement('div');
  axis.className = 'chart-axis';
  axis.append(...rows.map(({ month }) => {
    const span = document.createElement('span');
    span.textContent = monthLabel(month).slice(0, 1);
    return span;
  }));
  chart.after(axis);
  renderHistoryList(payment, rows, amounts);
}

function renderHistoryList(payment, rows, amounts) {
  // Newest first in the list, with the change against the previous month with an amount.
  const list = rows.map((row, i) => ({ ...row, prev: amounts.slice(0, i).filter((a) => a != null).at(-1) })).reverse();
  $('history-list').replaceChildren(...list.map(({ month, record, prev }) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'month';
    name.textContent = monthLabel(month);
    const amount = document.createElement('span');
    amount.className = 'amount state clickable';
    amount.textContent = record?.amount != null ? formatAmount(record.amount)
      : record?.paid ? '+ monto' : 'Sin pagar';
    amount.title = 'Editar monto';
    amount.addEventListener('click', () => {
      historyEdit = monthKey(month);
      renderHistory(payment);
    });
    const delta = document.createElement('span');
    delta.className = 'delta';
    if (record?.amount != null && prev) {
      const change = Math.round(((record.amount - prev) / prev) * 100);
      delta.textContent = change === 0 ? '=' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} %`;
      delta.title = `Respecto a ${formatAmount(prev)}`;
    }
    li.append(name, amount, delta);
    if (historyEdit === monthKey(month)) {
      li.append(amountEditor(payment, month, () => {
        historyEdit = null;
        renderSiteSettings();
      }));
    }
    return li;
  }));
}

// Hover tooltip for the bars (the whole column is the hit target).
$('history-chart').addEventListener('mousemove', (e) => {
  const col = e.target.closest('.col');
  $('history-chart').querySelectorAll('.col.active').forEach((c) => c !== col && c.classList.remove('active'));
  if (!col) {
    $('history-tip').hidden = true;
    return;
  }
  col.classList.add('active');
  $('history-tip').textContent = col.dataset.tip;
  $('history-tip').hidden = false;
  const tip = $('history-tip').getBoundingClientRect();
  const x = Math.min(window.innerWidth - tip.width - 8, Math.max(8, e.clientX - tip.width / 2));
  $('history-tip').style.left = `${x}px`;
  $('history-tip').style.top = `${e.clientY - tip.height - 10}px`;
});
$('history-chart').addEventListener('mouseleave', () => {
  $('history-tip').hidden = true;
  $('history-chart').querySelectorAll('.col.active').forEach((c) => c.classList.remove('active'));
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

function setBackupStatus(message, kind = '') {
  $('backup-status').textContent = message;
  $('backup-status').className = `status ${kind}`;
  $('backup-status').hidden = !message;
}

async function renderBackupStatus() {
  const { lastBackup } = await chrome.storage.local.get('lastBackup');
  setBackupStatus(lastBackup
    ? `Último respaldo: ${new Date(lastBackup.at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · ${lastBackup.path}`
    : 'Todavía no hay respaldos.');
}

$('backup-btn').addEventListener('click', async () => {
  $('backup-btn').disabled = true;
  try {
    // Same folder as the receipts; ask for it first if it was never chosen.
    if (!rootHandle) {
      rootHandle = await chooseRootFolder();
      renderFolder();
      if (!rootHandle) return;
    }
    if (!(await ensureWritePermission(rootHandle))) throw new Error('Sin permiso para escribir en la carpeta.');
    setBackupStatus('Guardando…');
    const date = new Date();
    const path = await saveBackup(rootHandle, await backupData(date), date);
    await chrome.storage.local.set({ lastBackup: { at: date.getTime(), path } });
    setBackupStatus(`✅ Guardado en ${path}`, 'ok');
  } catch (err) {
    setBackupStatus(`No se pudo respaldar (${err.message}).`, 'error');
  } finally {
    $('backup-btn').disabled = false;
  }
});

// Backup picked and validated, waiting for "Restaurar": { data, missing } where missing are
// the sites without permission (asked for in the same click, so their border works again).
let restoreCandidate = null;

$('restore-btn').addEventListener('click', async () => {
  $('restore-confirm').hidden = true;
  try {
    const picked = await pickBackupFile(rootHandle);
    if (!picked) return;
    const problem = backupProblem(picked.data);
    if (problem) throw new Error(problem);
    const { data } = picked;
    const domains = [...new Set(data.payments.map((p) => p.domain))];
    const missing = [];
    for (const domain of domains) if (!(await hasSitePermission(domain))) missing.push(domain);
    restoreCandidate = { data, missing };
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'fecha desconocida';
    const count = data.payments.length;
    $('restore-text').textContent = `${picked.name} (${when}), ${count} ${count === 1 ? 'pago' : 'pagos'}. `
      + 'Se fusiona con tus datos actuales sin borrar nada: los pagos que ya tienes conservan su configuración '
      + 'y suman los meses y montos del respaldo. Antes se guarda un respaldo del estado actual.';
    $('restore-confirm').hidden = false;
    setBackupStatus('');
  } catch (err) {
    setBackupStatus(`No se pudo leer el respaldo (${err.message}).`, 'error');
  }
});

$('restore-cancel').addEventListener('click', () => {
  restoreCandidate = null;
  $('restore-confirm').hidden = true;
  renderBackupStatus();
});

$('restore-ok').addEventListener('click', async () => {
  if (!restoreCandidate) return;
  const { data, missing } = restoreCandidate;
  // Permission prompts need the click, so this goes first. Restored either way.
  const permission = missing.length
    ? chrome.permissions.request({ origins: missing.flatMap(matchPatterns) }).catch(() => false)
    : null;
  $('restore-ok').disabled = true;
  try {
    await permission;
    // Safety copy of the current data, next to the other backups.
    if (!rootHandle) {
      rootHandle = await chooseRootFolder();
      renderFolder();
      if (!rootHandle) throw new Error('Elige la carpeta de comprobantes para guardar antes un respaldo del estado actual.');
    }
    if (!(await ensureWritePermission(rootHandle))) throw new Error('Sin permiso para escribir en la carpeta.');
    const date = new Date();
    const safety = await saveBackup(rootHandle, await backupData(date), date, 'pagos-antes-de-restaurar');
    const { added, merged } = await restoreBackup(data);
    restoreCandidate = null;
    $('restore-confirm').hidden = true;
    const parts = [added && `${added} ${added === 1 ? 'pago agregado' : 'pagos agregados'}`,
      merged && `${merged} ${merged === 1 ? 'pago actualizado' : 'pagos actualizados'}`].filter(Boolean);
    setBackupStatus(`✅ Respaldo restaurado: ${parts.join(', ') || 'sin cambios'}. El estado anterior quedó en ${safety}`, 'ok');
  } catch (err) {
    setBackupStatus(`No se pudo restaurar (${err.message}).`, 'error');
  } finally {
    $('restore-ok').disabled = false;
  }
});

for (let h = 0; h < 24; h++) $('set-hour').add(new Option(`${String(h).padStart(2, '0')}:00`, String(h)));

async function renderGeneralSettings() {
  const current = await getSettings();
  $('set-notifications').checked = current.notifications;
  $('set-days').value = current.reminderDaysBefore;
  $('set-hour').value = String(current.reminderHour);
  $('set-days').disabled = $('set-hour').disabled = !current.notifications;
  renderBackupStatus();
}

$('set-notifications').addEventListener('change', async (e) => {
  await updateSettings({ notifications: e.target.checked });
  renderGeneralSettings();
});
$('set-days').addEventListener('change', (e) => {
  const days = Math.min(15, Math.max(0, Math.round(Number(e.target.value) || 0)));
  e.target.value = days;
  updateSettings({ reminderDaysBefore: days });
});
$('set-hour').addEventListener('change', (e) => updateSettings({ reminderHour: Number(e.target.value) }));

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const setStatus = (message, kind) => {
    $('pw-status').textContent = message;
    $('pw-status').className = `status ${kind}`;
    $('pw-status').hidden = !message;
  };
  const problem = passwordProblem($('pw-new').value, $('pw-confirm').value);
  if (problem) return setStatus(problem, 'error');
  if (!(await checkPassword($('pw-current').value))) return setStatus('La clave actual no es correcta.', 'error');
  await setPassword($('pw-new').value);
  e.target.reset();
  setStatus('✅ Clave cambiada.', 'ok');
});

$('lock-btn').addEventListener('click', lockNow);

$('shortcuts-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// --- Receipts captured outside the panel: downloaded PDFs and menu/shortcut screenshots ---

// PDFs already handled in this session, shown until the panel closes.
const movedPdfs = [];
let movingPdfs = false;

function pdfRow(title, detail, kind, onDismiss, extra = null) {
  const li = document.createElement('li');
  const text = document.createElement('div');
  text.className = 'text';
  const name = document.createElement('div');
  name.textContent = title;
  const sub = document.createElement('div');
  sub.className = `sub ${kind}`;
  sub.textContent = detail;
  text.append(name, sub);
  if (extra) text.append(extra);
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
    if (!item.paymentId && !item.error) {
      // Site with several payments: let the user pick which one this receipt is for.
      const options = (await findAllByDomain(item.domain)).sort(byName);
      if (options.length === 0) {
        await deletePendingPdf(item.id);
        continue;
      }
      const pick = document.createElement('div');
      pick.className = 'pick';
      for (const payment of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'secondary';
        btn.textContent = shortName(payment);
        btn.addEventListener('click', async () => {
          await addPendingPdf({ ...item, paymentId: payment.id });
          await movePendingPdfs({ interactive: true });
        });
        pick.append(btn);
      }
      rows.push(pdfRow(item.filename, `${item.domain}: ¿de qué pago es?`, '',
        () => deletePendingPdf(item.id).then(() => renderPdfs()), pick));
      continue;
    }
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
  for (const moved of movedPdfs) {
    const payment = moved.askAmount ? await findById(moved.paymentId) : null;
    const amount = payment && amountFor(payment, moved.date);
    const editor = payment && (amount == null || amount === payment.defaultAmount)
      ? amountEditor(payment, moved.date, () => {
        moved.askAmount = false;
        renderPdfs();
      })
      : null;
    rows.push(pdfRow(moved.filename, `✅ ${moved.path}`, 'ok', null, editor));
  }

  $('pdf-list').replaceChildren(...rows);
  $('pdfs').hidden = rows.length === 0;
  $('pdf-move-btn').hidden = !(needsPermission && pending.some((i) => i.blob && i.paymentId));
}

// interactive: called from a click, so the folder permission prompt can be shown.
async function movePendingPdfs({ interactive = false } = {}) {
  if (locked || movingPdfs) return;
  movingPdfs = true;
  try {
    const pending = (await getPendingPdfs()).filter((i) => i.blob && i.paymentId);
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
        const { path, dir, name } = await saveFile(rootHandle, payment, item.blob, item.filename, date);
        await addReceipt(payment.id, { dir, name }, date);
        await markPaid(payment.id, date);
        // Downloads are moved: drop the copy left in Downloads.
        if (typeof item.id === 'number') {
          await chrome.downloads.removeFile(item.id).catch(() => {});
          await chrome.downloads.erase({ id: item.id }).catch(() => {});
        }
        await deletePendingPdf(item.id);
        movedPdfs.unshift({ filename: item.filename, path, paymentId: payment.id, date, askAmount: true });
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
  if (changes.payments || changes.settings) render();
});

trackPanel();
reloadOnLock();
// Locked every time the panel opens, even if another window's panel is unlocked.
requireUnlock($('view-lock'), () => {
  locked = false;
  showView('main');
  getRootHandle()
    .then((handle) => { rootHandle = handle ?? null; })
    .catch(() => {})
    .finally(() => {
      renderFolder();
      movePendingPdfs();
    });
  render();
}, { always: true });
