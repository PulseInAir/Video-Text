import { FORMATS } from '../lib/formats.js';

const $ = (s) => document.querySelector(s);
const RT = chrome.runtime;

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function tell(message) {
  const tab = await activeTab();
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/overlay.css'] });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      return null;
    }
  }
}

async function refresh() {
  const { count } = (await RT.sendMessage({ type: 'count' })) || { count: 0 };
  $('#count').textContent = `${count} saved`;
  $('#export').disabled = !count;

  const info = await tell({ type: 'has-video' });
  const el = $('#status');
  if (!info) {
    el.innerHTML = `Can't run here. Chrome blocks extensions on internal pages like <b>chrome://</b> and the Web Store.`;
    $('#select').disabled = $('#grab').disabled = true;
  } else if (info.hasVideo) {
    el.innerHTML = `Video detected on <b>${info.site}</b>. Draw a box over the text you want.`;
  } else {
    el.innerHTML = `No video found yet on <b>${info.site}</b>. Start playback, then try again.`;
  }
}

// Populate export formats
for (const [key, f] of Object.entries(FORMATS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = f.label;
  $('#format').append(o);
}
chrome.storage.sync.get('format').then(({ format }) => {
  if (format) $('#format').value = format;
});

$('#select').onclick = async () => {
  await tell({ type: 'toggle-select' });
  window.close();
};

$('#grab').onclick = async () => {
  const r = await tell({ type: 'grab-now' });
  if (r?.ok) { toast('Text extracted'); window.close(); }
  else toast(r?.error || 'Could not extract text', true);
};

$('#export').onclick = async () => {
  const format = $('#format').value;
  await chrome.storage.sync.set({ format });
  const r = await RT.sendMessage({ type: 'export', format });
  if (r?.ok) toast('Saved ' + r.filename);
  else toast(r?.error || 'Export failed', true);
};

$('#library').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: RT.getURL('pages/library.html') });
};

$('#options').onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

refresh();
