// Fake chrome.* APIs and sample data, so the real panel and summary pages can be rendered for
// the store images. Injected by render.sh into copies of sidepanel.html and summary.html.
// Query params: ?tab=<url of the active tab>  ?locked (show the lock screen).
(() => {
  const params = new URLSearchParams(location.search);
  const now = new Date();
  const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthsAgo = (n) => new Date(now.getFullYear(), now.getMonth() - n, 1);
  const thisMonth = key(now);
  const yearAgo = monthsAgo(24);

  // Paid records ending this month (or last month if `unpaidNow`). The 12 amounts given are the
  // last year; the year before repeats them a bit lower, so the summary has a period to compare.
  function history(recent, { day = 8, unpaidNow = false } = {}) {
    const amounts = recent.length === 12 ? [...recent.map((a) => Math.round(a * 0.94 / 10) * 10), ...recent] : recent;
    const records = {};
    amounts.forEach((amount, i) => {
      const month = monthsAgo(amounts.length - 1 - i);
      if (unpaidNow && key(month) === thisMonth) return;
      records[key(month)] = { paid: true, paidAt: new Date(month.getFullYear(), month.getMonth(), day, 10, 30).getTime(), amount };
    });
    return records;
  }
  const receipt = (folder) => ({ [thisMonth]: [{ dir: `Recurrentes/${thisMonth} Octubre/${folder}`, name: `${thisMonth}-08_10-42-17.png` }] });

  const base = { showBorder: true, frequency: 1, endMonth: null, archived: false, fields: [], note: '', receipts: {}, pastFolders: [], captureMode: 'visible', successKeywords: [], createdAt: yearAgo.getTime(), startMonth: key(yearAgo) };
  const payments = [
    { ...base, id: 'luz', domain: 'electrica-ejemplo.cl', alias: 'Luz', type: 'recurring', dueDay: 20, url: 'https://electrica-ejemplo.cl/pagar',
      records: history([28900, 31200, 35800, 41200, 44900, 46300, 43100, 38700, 33400, 30100, 29800, 32450]), receipts: receipt('Luz'),
      fields: [{ label: 'Nº cliente', value: '1234567-8' }, { label: 'RUT', value: '12.345.678-9' }] },
    { ...base, id: 'agua', domain: 'aguas-ejemplo.cl', alias: 'Agua', type: 'recurring', dueDay: 25, url: 'https://aguas-ejemplo.cl',
      records: history([17200, 16900, 18400, 21900, 22800, 20100, 19300, 18100, 17600, 17900, 18300, 18990]), receipts: receipt('Agua') },
    { ...base, id: 'arriendo', domain: 'banco-ejemplo.cl', alias: 'Arriendo', type: 'recurring', dueDay: 5, url: 'https://banco-ejemplo.cl',
      records: history(Array(12).fill(450000), { day: 3 }), receipts: receipt('Arriendo') },
    { ...base, id: 'credito', domain: 'banco-ejemplo.cl', alias: 'Crédito auto', type: 'recurring', dueDay: 15, defaultAmount: 185000, url: 'https://banco-ejemplo.cl',
      records: history(Array(12).fill(185000), { day: 12 }),
      fields: [{ label: 'Nº de crédito', value: '00-482-1937' }, { label: 'RUT', value: '12.345.678-9' }],
      note: 'Cuota 18 de 48. Pagar con la cuenta corriente.' },
    { ...base, id: 'internet', domain: 'fibra-ejemplo.cl', alias: 'Internet', type: 'recurring', dueDay: Math.min(31, now.getDate() + 1), url: 'https://fibra-ejemplo.cl',
      records: history(Array(12).fill(25990), { unpaidNow: true }) },
    { ...base, id: 'gas', domain: 'gas-ejemplo.cl', alias: 'Gas', type: 'recurring', dueDay: null, url: 'https://gas-ejemplo.cl',
      records: history([12900, 13400, 15800, 19900, 24300, 26100, 24800, 19200, 15100, 13300, 12800, 12500], { unpaidNow: true }) },
    { ...base, id: 'colegio', domain: 'colegio-ejemplo.cl', alias: 'Colegio', type: 'recurring', dueDay: 10, url: 'https://colegio-ejemplo.cl',
      records: history(Array(10).fill(210000), { day: 9 }),
      receipts: receipt('Colegio'), startMonth: key(monthsAgo(9)) },
    { ...base, id: 'seguro', domain: 'seguros-ejemplo.cl', alias: 'Seguro auto', type: 'once', dueDay: null, url: 'https://seguros-ejemplo.cl',
      records: { [thisMonth]: { paid: true, paidAt: now.getTime(), amount: 120000 } } },
    { ...base, id: 'permiso', domain: 'municipio-ejemplo.cl', alias: 'Permiso de circulación', type: 'once', dueDay: null, url: 'https://municipio-ejemplo.cl',
      records: {} },
  ];

  const local = {
    payments,
    settings: { notifications: true, reminderDaysBefore: 3, reminderHour: 9, currency: 'CLP' },
    lock: { salt: '', hash: '', iterations: 1 },
  };
  const session = params.has('locked') ? {} : { unlocked: true };

  const area = (store) => ({
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return keys in store ? { [keys]: store[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
      return Object.fromEntries(Object.entries(keys).map(([k, fallback]) => [k, k in store ? store[k] : fallback]));
    },
    async set(values) { Object.assign(store, values); },
    async remove() {},
    async clear() {},
  });
  const event = { addListener() {}, removeListener() {} };
  const tabUrl = params.get('tab');

  window.chrome = {
    storage: { local: area(local), session: area(session), onChanged: event },
    tabs: {
      query: async () => (tabUrl ? [{ id: 1, windowId: 1, active: true, url: tabUrl }] : []),
      create: async () => ({}), update: async () => ({}), captureVisibleTab: async () => '',
      onActivated: event, onUpdated: event,
    },
    windows: { getCurrent: async () => ({ id: 1, incognito: false }), update: async () => ({}), onFocusChanged: event },
    permissions: { contains: async () => true, request: async () => true, remove: async () => true, onAdded: event, onRemoved: event },
    runtime: {
      getURL: (path) => `/${path}`,
      getManifest: () => ({ version: '1.0.0' }),
      connect: () => ({ onDisconnect: event, postMessage() {} }),
      onMessage: event,
    },
    downloads: { removeFile: async () => {}, erase: async () => {} },
    scripting: { executeScript: async () => [] },
  };
})();
