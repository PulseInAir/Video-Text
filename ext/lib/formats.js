// Export format builders. Each takes an array of capture records:
// { id, text, time, words, source, title, url }
// `time` is video currentTime in seconds (may be null).

export function pad(n, size = 2) {
  return String(Math.floor(n)).padStart(size, '0');
}

export function timestampSrt(sec) {
  if (sec == null || !isFinite(sec)) sec = 0;
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const s = Math.floor(sec);
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)},${pad(ms, 3)}`;
}

export function timestampVtt(sec) {
  return timestampSrt(sec).replace(',', '.');
}

export function toTxt(captures, opts = {}) {
  const parts = [];
  if (opts.header !== false && captures[0]) {
    parts.push(`# ${captures[0].title || 'Video Text export'}`);
    if (captures[0].url) parts.push(captures[0].url);
    parts.push('');
  }
  for (const c of captures) {
    if (opts.timestamps && c.time != null) {
      parts.push(`[${timestampVtt(c.time).slice(0, 8)}] ${c.text}`);
    } else {
      parts.push(c.text);
    }
  }
  return parts.join('\n').trim() + '\n';
}

export function toMarkdown(captures) {
  const head = captures[0] || {};
  const lines = [`# ${head.title || 'Video Text export'}`, ''];
  if (head.url) lines.push(`Source: <${head.url}>`, '');
  for (const c of captures) {
    const t = c.time != null ? `**[${timestampVtt(c.time).slice(0, 8)}]** ` : '';
    lines.push(`- ${t}${c.text.replace(/\n/g, ' ')}`);
  }
  return lines.join('\n') + '\n';
}

// Build cue windows: each capture runs until the next one starts.
// Guarantees strictly increasing, non-overlapping cues with positive duration —
// players reject subtitle files that violate either rule.
const MIN_DUR = 0.2; // seconds

function cues(captures, gap = 4) {
  const sorted = captures
    .filter((c) => c.text && c.text.trim())
    .map((c, i) => ({ time: c.time, text: c.text.trim(), i }))
    .sort((a, b) => {
      const ta = a.time ?? a.i * gap, tb = b.time ?? b.i * gap;
      return ta - tb || a.i - b.i;
    });

  // Merge captures landing on (almost) the same instant into one cue.
  const merged = [];
  for (const c of sorted) {
    const start = c.time ?? merged.length * gap;
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(start - prev.start) < 1e-3) {
      if (!prev.text.includes(c.text)) prev.text += '\n' + c.text;
    } else {
      merged.push({ start, text: c.text });
    }
  }

  // Assign ends, then push out any cue too short to be displayable.
  const out = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const next = merged[i + 1];
    let start = cur.start;
    const prev = out[out.length - 1];
    if (prev && start < prev.end) start = prev.end;
    let end = next ? Math.min(next.start, start + gap) : start + gap;
    if (end - start < MIN_DUR) end = start + MIN_DUR;
    out.push({ start, end, text: cur.text });
  }
  return out;
}

export function toSrt(captures) {
  return (
    cues(captures)
      .map(
        (c, i) =>
          `${i + 1}\n${timestampSrt(c.start)} --> ${timestampSrt(c.end)}\n${c.text}\n`
      )
      .join('\n') + '\n'
  );
}

export function toVtt(captures) {
  return (
    'WEBVTT\n\n' +
    cues(captures)
      .map(
        (c, i) =>
          `${i + 1}\n${timestampVtt(c.start)} --> ${timestampVtt(c.end)}\n${c.text}\n`
      )
      .join('\n')
  );
}

export function toJson(captures) {
  return JSON.stringify(captures, null, 2);
}

export function toCsv(captures) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['index', 'time_seconds', 'timestamp', 'text', 'source', 'url']];
  captures.forEach((c, i) =>
    rows.push([i + 1, c.time ?? '', c.time != null ? timestampVtt(c.time) : '', c.text, c.source || '', c.url || ''])
  );
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function toHtml(captures) {
  const head = captures[0] || {};
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  return `<!doctype html><meta charset="utf-8"><title>${esc(head.title || 'Video Text')}</title>
<body style="font:16px/1.6 system-ui;max-width:46rem;margin:3rem auto;padding:0 1rem">
<h1>${esc(head.title || 'Video Text export')}</h1>
${head.url ? `<p><a href="${esc(head.url)}">${esc(head.url)}</a></p>` : ''}
${captures
  .map(
    (c) =>
      `<p>${c.time != null ? `<b>[${timestampVtt(c.time).slice(0, 8)}]</b> ` : ''}${esc(c.text)}</p>`
  )
  .join('\n')}
</body>`;
}

/* ---------- DOCX (minimal OOXML zip, no dependencies) ---------- */

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Store-only (uncompressed) ZIP writer — valid .docx, valid .zip.
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0x21), // time/date (fixed)
      ...u32(crc), ...u32(body.length), ...u32(body.length),
      ...u16(nameBytes.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(local), nameBytes, body);
    central.push({ name: nameBytes, crc, size: body.length, offset });
    offset += local.length + nameBytes.length + body.length;
  }

  const cenChunks = [];
  let cenSize = 0;
  for (const e of central) {
    const h = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0x21),
      ...u32(e.crc), ...u32(e.size), ...u32(e.size),
      ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.offset),
    ];
    cenChunks.push(new Uint8Array(h), e.name);
    cenSize += h.length + e.name.length;
  }

  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(cenSize), ...u32(offset), ...u16(0),
  ]);

  const total = offset + cenSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...cenChunks, end]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function xmlEsc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[m]));
}

function docxParagraph(text, { bold = false, size = 22, spaceAfter = 120 } = {}) {
  const runs = String(text)
    .split('\n')
    .map((line, i) =>
      `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(line)}</w:t></w:r>`
    )
    .join('');
  return `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/></w:pPr>${runs}</w:p>`;
}

export function toDocx(captures, opts = {}) {
  const head = captures[0] || {};
  const body = [];
  body.push(docxParagraph(head.title || 'Video Text export', { bold: true, size: 32 }));
  if (head.url) body.push(docxParagraph(head.url, { size: 18 }));
  for (const c of captures) {
    const stamp = opts.timestamps !== false && c.time != null ? `[${timestampVtt(c.time).slice(0, 8)}] ` : '';
    body.push(docxParagraph(stamp + c.text));
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
  ]);
}

export const FORMATS = {
  txt: { label: 'Plain text (.txt)', ext: 'txt', mime: 'text/plain', build: (c, o) => toTxt(c, o) },
  srt: { label: 'SubRip subtitles (.srt)', ext: 'srt', mime: 'application/x-subrip', build: toSrt },
  vtt: { label: 'WebVTT (.vtt)', ext: 'vtt', mime: 'text/vtt', build: toVtt },
  docx: { label: 'Word document (.docx)', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: toDocx, binary: true },
  md: { label: 'Markdown (.md)', ext: 'md', mime: 'text/markdown', build: toMarkdown },
  csv: { label: 'Spreadsheet (.csv)', ext: 'csv', mime: 'text/csv', build: toCsv },
  json: { label: 'JSON (.json)', ext: 'json', mime: 'application/json', build: toJson },
  html: { label: 'Web page (.html)', ext: 'html', mime: 'text/html', build: toHtml },
};
