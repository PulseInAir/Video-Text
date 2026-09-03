import { FORMATS, timestampVtt } from '../lib/formats.js';

const $ = (s) => document.querySelector(s);
const RT = chrome.runtime;
let ALL = [];

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

for (const [key, f] of Object.entries(FORMATS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = f.label;
  $('#format').append(o);
}

function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const src = $('#source').value;
  return ALL.filter(
    (c) => (!src || c.source === src) && (!q || (c.text || '').toLowerCase().includes(q))
  );
}

function render() {
  const list = $('#list');
  const items = filtered();
  $('#count').textContent = `${ALL.length} captures`;
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = `<div class="card empty">${
      ALL.length
        ? 'No captures match that search.'
        : 'Nothing saved yet. Open a video, hit <b>Alt+S</b>, draw a box over the text and press Grab.'
    }</div>`;
    return;
  }

  for (const c of items) {
    const el = document.createElement('div');
    el.className = 'card item';
    const when = new Date(c.createdAt || Date.now()).toLocaleString();
    el.innerHTML = `
      <div class="body">
        <div class="meta">
          <span class="pill">${c.sourceName || c.source || 'page'}</span>
          ${c.time != null ? `<span>${timestampVtt(c.time).slice(0, 8)}</span>` : ''}
          <span>${when}</span>
          ${c.url ? `<a href="${c.url}" target="_blank" rel="noreferrer">open source</a>` : ''}
        </div>
        <div class="text" contenteditable="plaintext-only" spellcheck="false"></div>
      </div>
      <div class="acts">
        <button data-copy>Copy</button>
        <button data-del>Delete</button>
      </div>`;
    const text = el.querySelector('.text');
    text.textContent = c.text || '';
    text.addEventListener('blur', async () => {
      const v = text.textContent.trim();
      if (v !== c.text) {
        c.text = v;
        await RT.sendMessage({ type: 'update', id: c.id, patch: { text: v } });
        toast('Capture updated');
      }
    });
    el.querySelector('[data-copy]').onclick = async () => {
      await navigator.clipboard.writeText(text.textContent);
      toast('Copied');
    };
    el.querySelector('[data-del]').onclick = async () => {
      await RT.sendMessage({ type: 'delete', id: c.id });
      ALL = ALL.filter((x) => x.id !== c.id);
      render();
    };
    list.append(el);
  }
}

async function load() {
  const r = await RT.sendMessage({ type: 'list' });
  ALL = (r?.captures || []).slice().reverse();
  const sources = [...new Set(ALL.map((c) => c.source).filter(Boolean))];
  const sel = $('#source');
  sel.innerHTML = '<option value="">All sources</option>';
  for (const s of sources) {
    const name = ALL.find((c) => c.source === s)?.sourceName || s;
    sel.append(new Option(name, s));
  }
  render();
}

$('#q').oninput = render;
$('#source').onchange = render;

$('#export').onclick = async () => {
  const items = filtered().slice().reverse(); // chronological
  if (!items.length) return toast('Nothing to export', true);
  const r = await RT.sendMessage({
    type: 'export',
    format: $('#format').value,
    captures: items,
    timestamps: $('#stamps').checked,
  });
  if (r?.ok) toast('Saved ' + r.filename);
  else toast(r?.error || 'Export failed', true);
};

$('#clear').onclick = async () => {
  if (!confirm('Delete all saved captures? This cannot be undone.')) return;
  await RT.sendMessage({ type: 'clear' });
  ALL = [];
  render();
};

load();
