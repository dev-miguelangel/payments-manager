// Draws a white frame around pages of saved payment sites. Safe to inject more than once.
(() => {
  const ID = '__pagos-border';
  if (document.getElementById(ID)) return;

  const frame = document.createElement('div');
  frame.id = ID;
  const style = {
    all: 'initial',
    position: 'fixed',
    inset: '0',
    border: '5px solid #fff',
    // Dark hairline inside the white border so it stays visible on white pages.
    'box-shadow': 'inset 0 0 0 1px rgba(0, 0, 0, 0.35)',
    'pointer-events': 'none',
    'z-index': '2147483647',
  };
  for (const [prop, value] of Object.entries(style)) {
    frame.style.setProperty(prop, value, 'important');
  }

  const attach = () => {
    if (!frame.isConnected) document.documentElement.appendChild(frame);
  };
  attach();

  // Some sites rebuild the DOM (SPAs); put the frame back if it gets removed.
  globalThis.__pagosBorderObserver = new MutationObserver(attach);
  globalThis.__pagosBorderObserver.observe(document.documentElement, { childList: true });
})();
