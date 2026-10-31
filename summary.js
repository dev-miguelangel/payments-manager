import {
  appliesTo,
  displayName,
  dueDate,
  dueStatus,
  formatAmount,
  frequencyLabel,
  getPayments,
  getSettings,
  monthFromKey,
  monthKey,
  monthLabel,
  receiptsFor,
} from './lib/storage.js';
import { reloadOnLock, requireUnlock } from './lib/lock.js';
import { buildXlsx } from './lib/xlsx.js';

const $ = (id) => document.getElementById(id);

const PERIODS = [1, 3, 6, 12];

// What the detail table shows, for the export.
let shown = { rows: [], months: [] };

const params = new URLSearchParams(location.search);
let period = PERIODS.includes(Number(params.get('months'))) ? Number(params.get('months')) : 1;
let endMonth = /^\d{4}-\d{2}$/.test(params.get('end') ?? '') ? monthFromKey(params.get('end')) : startOfMonth(new Date());

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const addMonths = (date, delta) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

// The `count` months ending at `end`, oldest first.
function monthsUntil(end, count) {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'es', { sensitivity: 'base' });

const COMPACT = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const compactAmount = (amount) => `$${COMPACT.format(amount)}`;
const shortMonth = (date) => monthLabel(date).slice(0, 3);

// --- Data --------------------------------------------------------------------

// One row per payment and month: those with a record that month, and recurring ones due then.
function rowsFor(payments, months, reminderDaysBefore) {
  const thisMonth = monthKey(new Date());
  const rows = [];
  for (const month of months) {
    const key = monthKey(month);
    for (const payment of [...payments].sort(byName)) {
      const record = payment.records[key] ?? null;
      if (!record && !appliesTo(payment, month)) continue;
      let status;
      if (record?.paid) status = { kind: 'paid', text: 'Pagado' };
      else if (key < thisMonth) status = { kind: 'overdue', text: 'Sin pagar' };
      else status = dueStatus(payment, month, { reminderDaysBefore });
      rows.push({
        payment,
        month,
        record,
        status,
        amount: record?.amount ?? null,
        due: payment.type === 'recurring' ? dueDate(payment, month) : null,
        receipts: receiptsFor(payment, month).length,
      });
    }
  }
  return rows;
}

// Totals per month split by type: [{ month, recurring, once, total }].
function monthTotals(payments, months) {
  return months.map((month) => {
    const key = monthKey(month);
    const sums = { recurring: 0, once: 0 };
    for (const p of payments) sums[p.type] += p.records[key]?.amount ?? 0;
    return { month, ...sums, total: sums.recurring + sums.once };
  });
}

// Total per payment over the period, biggest first: [{ payment, total, count }].
function paymentTotals(rows) {
  const byPayment = new Map();
  for (const row of rows) {
    if (row.amount == null) continue;
    const entry = byPayment.get(row.payment.id) ?? { payment: row.payment, total: 0, count: 0 };
    entry.total += row.amount;
    entry.count += 1;
    byPayment.set(row.payment.id, entry);
  }
  return [...byPayment.values()].filter((e) => e.total > 0).sort((a, b) => b.total - a.total);
}

// --- Render ------------------------------------------------------------------

async function render() {
  if ($('content').hidden) return; // Still locked.
  const [payments, settings] = await Promise.all([getPayments(), getSettings()]);
  const months = monthsUntil(endMonth, period);
  const rows = rowsFor(payments, months, settings.reminderDaysBefore);
  shown = { rows, months };

  renderControls(months);
  renderTiles(payments, months, rows);
  // A single month is compared against the one before it.
  renderMonthsChart(monthTotals(payments, period === 1 ? monthsUntil(endMonth, 2) : months));
  renderPaymentsChart(paymentTotals(rows));
  renderDetail(rows, months);
}

function renderControls(months) {
  document.querySelectorAll('[data-months]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.months) === period));
  });
  $('end-month').value = monthKey(endMonth);
  $('range-label').textContent = months.length === 1
    ? monthLabel(months[0])
    : `${monthLabel(months[0])} – ${monthLabel(months.at(-1))}`;
  $('months-title').textContent = period === 1 ? 'Comparación con el mes anterior' : 'Gasto por mes';
  document.title = `Resumen de pagos · ${$('range-label').textContent}`;
}

function tile(label, value, sub = '') {
  const el = document.createElement('div');
  el.className = 'tile';
  const l = document.createElement('div');
  l.className = 'tile-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'tile-value';
  v.textContent = value;
  el.append(l, v);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'tile-sub';
    s.textContent = sub;
    el.append(s);
  }
  return el;
}

// "▲ 12 % vs 3 meses anteriores ($240.000)". With fewer months recorded back then the
// percentage would mislead (a new user's first months), so only the amount is shown.
function changeText(current, previous, what, complete) {
  if (!previous) return `Sin montos en ${what}`;
  if (!complete) return `${what[0].toUpperCase()}${what.slice(1)}: ${formatAmount(previous)} (con meses sin montos)`;
  const change = Math.round(((current - previous) / previous) * 100);
  const arrow = change === 0 ? '=' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} %`;
  return `${arrow} vs ${what} (${formatAmount(previous)})`;
}

function renderTiles(payments, months, rows) {
  const totals = monthTotals(payments, months);
  const total = totals.reduce((sum, m) => sum + m.total, 0);
  const previousTotals = monthTotals(payments, monthsUntil(addMonths(endMonth, -period), period));
  const previous = previousTotals.reduce((sum, m) => sum + m.total, 0);
  const complete = previousTotals.every((m) => m.total > 0);
  const what = period === 1 ? 'mes anterior' : `${period} meses anteriores`;

  const paid = rows.filter((r) => r.record?.paid);
  const unpaid = rows.length - paid.length;
  const noAmount = paid.filter((r) => r.amount == null).length;
  const paidSub = [unpaid && `${unpaid} sin pagar`, noAmount && `${noAmount} sin monto`].filter(Boolean).join(' · ');

  const tiles = [tile('Total pagado', formatAmount(total), changeText(total, previous, what, complete))];
  if (period === 1) {
    const top = rows.filter((r) => r.amount != null).sort((a, b) => b.amount - a.amount)[0];
    tiles.push(tile('Pago más alto', top ? formatAmount(top.amount) : '—', top ? displayName(top.payment) : ''));
  } else {
    const withAmounts = totals.filter((m) => m.total > 0);
    const average = withAmounts.length ? Math.round(total / withAmounts.length) : 0;
    tiles.push(tile('Promedio mensual', formatAmount(average),
      withAmounts.length < period ? `De ${withAmounts.length} meses con montos` : ''));
    const top = [...totals].sort((a, b) => b.total - a.total)[0];
    tiles.push(tile('Mes de mayor gasto', top?.total ? monthLabel(top.month) : '—', top?.total ? formatAmount(top.total) : ''));
  }
  tiles.push(tile('Pagos realizados', `${paid.length} de ${rows.length}`, paidSub));
  $('tiles').replaceChildren(...tiles);
}

// Clean axis steps: 1, 2, 2.5, 5 × 10ⁿ, about four ticks.
function niceMax(max) {
  if (max <= 0) return { top: 0, step: 0 };
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

const SERIES = [
  { key: 'recurring', label: 'Recurrentes' },
  { key: 'once', label: 'Únicos' },
];

function renderMonthsChart(totals) {
  const max = Math.max(0, ...totals.map((m) => m.total));
  const chart = $('months-chart');
  $('months-empty').hidden = max > 0;
  chart.hidden = $('months-legend').hidden = max === 0;
  if (!max) return;

  $('months-legend').replaceChildren(...SERIES.map(({ key, label }) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = `swatch ${key}`;
    item.append(swatch, label);
    return item;
  }));

  const { top, step } = niceMax(max);
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (let value = 0; value <= top; value += step) {
    const line = document.createElement('div');
    line.className = 'gridline';
    line.style.bottom = `${(value / top) * 100}%`;
    const tick = document.createElement('span');
    tick.textContent = value ? compactAmount(value) : '0';
    line.append(tick);
    grid.append(line);
  }

  // Direct labels only on the latest month and the highest one; the tooltip and table carry the rest.
  const highest = totals.reduce((best, m) => (m.total > best.total ? m : best), totals[0]);
  const cols = document.createElement('div');
  cols.className = 'cols';
  cols.append(...totals.map((m, i) => {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tip = [
      monthLabel(m.month),
      `Total: ${formatAmount(m.total)}`,
      ...SERIES.map(({ key, label }) => `${label}: ${formatAmount(m[key])}`),
    ].join('\n');
    const stack = document.createElement('div');
    stack.className = 'stack';
    stack.style.height = `${(m.total / top) * 100}%`;
    const present = SERIES.filter(({ key }) => m[key]);
    for (const [j, { key }] of present.entries()) {
      const seg = document.createElement('div');
      // Only the top segment gets the rounded data-end.
      seg.className = `seg ${key}${j === present.length - 1 ? ' top' : ''}`;
      seg.style.flexGrow = String(m[key]);
      stack.append(seg);
    }
    if (m.total && (m === highest || i === totals.length - 1)) {
      const value = document.createElement('div');
      value.className = 'cap';
      value.textContent = compactAmount(m.total);
      stack.append(value);
    }
    const label = document.createElement('div');
    label.className = 'xlabel';
    label.textContent = totals.length > 6 ? shortMonth(m.month) : monthLabel(m.month);
    col.append(stack, label);
    return col;
  }));

  chart.replaceChildren(grid, cols);
  chart.setAttribute('aria-label', totals.map((m) => `${monthLabel(m.month)} ${formatAmount(m.total)}`).join(', '));
}

const MAX_PAYMENT_BARS = 12;

function renderPaymentsChart(totals) {
  const chart = $('payments-chart');
  $('payments-empty').hidden = totals.length > 0;
  chart.hidden = totals.length === 0;
  if (!totals.length) return;

  // Past a dozen payments, the smallest fold into "Otros".
  let shown = totals;
  if (totals.length > MAX_PAYMENT_BARS) {
    const rest = totals.slice(MAX_PAYMENT_BARS - 1);
    shown = [...totals.slice(0, MAX_PAYMENT_BARS - 1), {
      name: `Otros (${rest.length})`,
      total: rest.reduce((sum, e) => sum + e.total, 0),
      count: rest.reduce((sum, e) => sum + e.count, 0),
    }];
  }
  const max = shown[0].total;
  chart.replaceChildren(...shown.map((entry) => {
    const name = entry.name ?? displayName(entry.payment);
    const row = document.createElement('div');
    row.className = 'hrow';
    row.dataset.tip = [
      name,
      `Total: ${formatAmount(entry.total)}`,
      `${entry.count} ${entry.count === 1 ? 'pago' : 'pagos'} · promedio ${formatAmount(Math.round(entry.total / entry.count))}`,
    ].join('\n');
    const label = document.createElement('div');
    label.className = 'hlabel';
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'htrack';
    const bar = document.createElement('div');
    bar.className = 'hbar';
    bar.style.width = `${Math.max(1, (entry.total / max) * 100)}%`;
    const value = document.createElement('span');
    value.className = 'hvalue';
    value.textContent = formatAmount(entry.total);
    track.append(bar, value);
    row.append(label, track);
    return row;
  }));
  chart.setAttribute('aria-label', shown.map((e) => `${e.name ?? displayName(e.payment)} ${formatAmount(e.total)}`).join(', '));
}

function cell(text, className = '') {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

const formatDay = (date) => date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
const formatDate = (ms) => new Date(ms).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

function renderDetail(rows, months) {
  $('detail-empty').hidden = rows.length > 0;
  $('detail').hidden = rows.length === 0;

  // Newest month first, each with a subtotal row.
  const body = [];
  for (const month of [...months].reverse()) {
    const monthRows = rows.filter((r) => r.month === month);
    if (!monthRows.length) continue;
    const subtotal = monthRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    const head = document.createElement('tr');
    head.className = 'group';
    const th = document.createElement('th');
    th.colSpan = 6;
    th.textContent = monthLabel(month);
    head.append(th, cell(formatAmount(subtotal), 'num'), cell(''));
    body.push(head);
    for (const r of monthRows) {
      const tr = document.createElement('tr');
      const status = cell(r.status.text, `status ${r.status.kind}`);
      tr.append(
        cell(r.payment.alias || r.payment.domain),
        cell(r.payment.domain, 'muted'),
        cell(frequencyLabel(r.payment)),
        cell(r.due ? formatDay(r.due) : '—', 'muted'),
        status,
        cell(r.record?.paidAt ? formatDate(r.record.paidAt) : '—', 'muted'),
        cell(r.amount != null ? formatAmount(r.amount) : '—', 'num'),
        cell(r.receipts ? String(r.receipts) : '—', 'num muted'),
      );
      body.push(tr);
    }
  }
  $('detail').tBodies[0].replaceChildren(...body);

  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const foot = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 6;
  th.textContent = 'Total';
  foot.append(th, cell(formatAmount(total), 'num'), cell(''));
  $('detail').tFoot.replaceChildren(foot);
}

// --- Tooltip -----------------------------------------------------------------

function showTip(e, target) {
  const tip = $('tip');
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - box.width - 8, Math.max(8, e.clientX - box.width / 2));
  const y = e.clientY - box.height - 12 < 8 ? e.clientY + 16 : e.clientY - box.height - 12;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

for (const id of ['months-chart', 'payments-chart']) {
  $(id).addEventListener('mousemove', (e) => {
    const target = e.target.closest('[data-tip]');
    $(id).querySelectorAll('.active').forEach((el) => el !== target && el.classList.remove('active'));
    if (!target) {
      $('tip').hidden = true;
      return;
    }
    target.classList.add('active');
    showTip(e, target);
  });
  $(id).addEventListener('mouseleave', () => {
    $('tip').hidden = true;
    $(id).querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
  });
}

// --- Controls ----------------------------------------------------------------

function updateUrl() {
  history.replaceState(null, '', `?months=${period}&end=${monthKey(endMonth)}`);
}

document.querySelectorAll('[data-months]').forEach((btn) => btn.addEventListener('click', () => {
  period = Number(btn.dataset.months);
  updateUrl();
  render();
}));

$('end-month').addEventListener('change', (e) => {
  if (!e.target.value) return;
  endMonth = monthFromKey(e.target.value);
  updateUrl();
  render();
});

// Exports the detail table: one row per payment and month, newest month first, plus the total.
$('export-btn').addEventListener('click', () => {
  const { rows, months } = shown;
  const ordered = [...months].reverse().flatMap((month) => rows.filter((r) => r.month === month));
  const columns = [
    { header: 'Mes', width: 16 },
    { header: 'Pago', width: 24 },
    { header: 'Sitio', width: 24 },
    { header: 'Tipo', width: 12 },
    { header: 'Vence', width: 12 },
    { header: 'Estado', width: 20 },
    { header: 'Fecha de pago', width: 14 },
    { header: 'Monto', width: 14, type: 'currency' },
    { header: 'Comprobantes', width: 14 },
  ];
  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const blob = buildXlsx({
    sheetName: 'Resumen',
    columns,
    rows: ordered.map((r) => [
      monthLabel(r.month),
      r.payment.alias || r.payment.domain,
      r.payment.domain,
      frequencyLabel(r.payment),
      r.due,
      r.status.text,
      r.record?.paidAt ? new Date(r.record.paidAt) : null,
      r.amount,
      r.receipts,
    ]),
    totalRow: ['Total', null, null, null, null, null, null, total, null],
  });
  const range = months.length === 1 ? monthKey(months[0]) : `${monthKey(months[0])} a ${monthKey(months.at(-1))}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Resumen de pagos ${range}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
});

// Amounts edited in the panel show up here without reloading.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.payments || changes.settings)) render();
});

reloadOnLock();
requireUnlock($('lock'), () => {
  $('content').hidden = false;
  render();
});
