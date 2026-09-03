const DEFAULTS = { autoPause: true, autoCopy: false, lang: 'eng', psm: 6, contrast: true, upscale: 2 };
const FIELDS = Object.keys(DEFAULTS);
const $ = (s) => document.querySelector(s);

function read() {
  const out = {};
  for (const k of FIELDS) {
    const el = $('#' + k);
    if (!el) continue;
    out[k] = el.type === 'checkbox' ? el.checked : isNaN(+el.value) ? el.value : +el.value;
  }
  return out;
}

async function save() {
  const prefs = read();
  await chrome.storage.sync.set({ prefs });
  // push live to every open tab
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'prefs', prefs }).catch(() => {});
}

chrome.storage.sync.get('prefs').then(({ prefs }) => {
  const p = { ...DEFAULTS, ...(prefs || {}) };
  for (const k of FIELDS) {
    const el = $('#' + k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!p[k];
    else el.value = String(p[k]);
    el.addEventListener('change', save);
  }
});
