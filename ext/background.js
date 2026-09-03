import { FORMATS } from './lib/formats.js';

const OFFSCREEN = 'pages/offscreen.html';
let creating = null;

async function hasOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctxs.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (creating) return creating;
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: ['WORKERS', 'DOM_SCRAPING'],
      justification: 'Runs the local OCR engine on captured video frames.',
    })
    .catch((e) => {
      if (!/single offscreen/i.test(e?.message || '')) throw e;
    })
    .finally(() => { creating = null; });
  return creating;
}

async function ocr(payload) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'ocr', ...payload });
}

/* ---------------- capture library ---------------- */
const KEY = 'captures';

async function getCaptures() {
  const { [KEY]: c } = await chrome.storage.local.get(KEY);
  return c || [];
}

async function addCapture(capture) {
  const all = await getCaptures();
  all.push({ id: crypto.randomUUID(), ...capture });
  // keep the library bounded
  const trimmed = all.slice(-2000);
  await chrome.storage.local.set({ [KEY]: trimmed });
  return trimmed.length;
}

/* ---------------- export ---------------- */
function dataUrlFor(content, mime) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

function safeName(s) {
  return (s || 'video-text').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function exportCaptures({ format = 'txt', captures, filename, timestamps = true }) {
  const fmt = FORMATS[format];
  if (!fmt) throw new Error('Unknown format: ' + format);
  const list = captures?.length ? captures : await getCaptures();
  if (!list.length) throw new Error('Nothing to export yet.');
  const content = fmt.build(list, { timestamps });
  const name = `${safeName(filename || list[0]?.title)}.${fmt.ext}`;
  await chrome.downloads.download({
    url: dataUrlFor(content, fmt.mime),
    filename: name,
    saveAs: true,
  });
  return { ok: true, filename: name };
}

/* ---------------- messaging ---------------- */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === 'offscreen') return false;

  const handlers = {
    ocr: () => ocr({ dataUrl: msg.dataUrl, lang: msg.lang, psm: msg.psm }),
    'save-capture': async () => {
      const count = await addCapture(msg.capture);
      return { ok: true, count };
    },
    count: async () => ({ ok: true, count: (await getCaptures()).length }),
    list: async () => ({ ok: true, captures: await getCaptures() }),
    clear: async () => {
      await chrome.storage.local.set({ [KEY]: [] });
      return { ok: true };
    },
    delete: async () => {
      const all = await getCaptures();
      await chrome.storage.local.set({ [KEY]: all.filter((c) => c.id !== msg.id) });
      return { ok: true };
    },
    update: async () => {
      const all = await getCaptures();
      const i = all.findIndex((c) => c.id === msg.id);
      if (i >= 0) all[i] = { ...all[i], ...msg.patch };
      await chrome.storage.local.set({ [KEY]: all });
      return { ok: true };
    },
    export: () => exportCaptures(msg),
    'open-library': async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL('pages/library.html') });
      return { ok: true };
    },
  };

  const h = handlers[msg?.type];
  if (!h) return false;
  Promise.resolve(h())
    .then((r) => reply(r ?? { ok: true }))
    .catch((e) => reply({ ok: false, error: e?.message || String(e) }));
  return true;
});

/* ---------------- commands & menus ---------------- */
async function tell(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/overlay.css'] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (cmd === 'toggle-select') await tell(tab.id, { type: 'toggle-select' });
  if (cmd === 'grab-frame') await tell(tab.id, { type: 'grab-now' });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vtx-select',
      title: 'Extract text from this video',
      contexts: ['video', 'page'],
    });
    chrome.contextMenus.create({
      id: 'vtx-library',
      title: 'Open Video Text library',
      contexts: ['action'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'vtx-select' && tab?.id) await tell(tab.id, { type: 'toggle-select' });
  if (info.menuItemId === 'vtx-library') await chrome.tabs.create({ url: chrome.runtime.getURL('pages/library.html') });
});

export { exportCaptures };
