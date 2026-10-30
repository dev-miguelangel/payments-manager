// Hides the white border while capturing so it doesn't end up in the receipt.
async function setBorderVisible(tabId, visible) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [visible],
    func: (visible) => new Promise((resolve) => {
      document.getElementById('__pagos-border')
        ?.style.setProperty('display', visible ? 'block' : 'none', 'important');
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }),
  }).catch(() => {});
}

// Needs activeTab (menu, shortcut, toolbar icon) or the all-sites permission.
export async function captureTab(tab) {
  await setBorderVisible(tab.id, false);
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return await (await fetch(dataUrl)).blob();
  } finally {
    await setBorderVisible(tab.id, true);
  }
}
