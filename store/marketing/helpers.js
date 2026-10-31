// Runs `fn(doc)` inside an iframe once its page has rendered.
function whenReady(iframe, fn, delay = 900) {
  iframe.addEventListener('load', () => setTimeout(() => fn(iframe.contentDocument), delay));
}
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const NOW = new Date();
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`;
const MONTH_FOLDER = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')} ${MONTHS[NOW.getMonth()]}`;
