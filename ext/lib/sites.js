// Per-site adapters: how to find the video element, a nice title, and a
// timestamp-bearing permalink. Falls back to a generic adapter everywhere else.

const ADAPTERS = [
  {
    id: 'youtube',
    name: 'YouTube',
    match: /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|(^|\.)youtu\.be$/,
    videoSelectors: ['video.html5-main-video', '#movie_player video', 'video'],
    title: () =>
      document.querySelector('h1.ytd-watch-metadata, h1.title yt-formatted-string')?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, ''),
    permalink: (t) => {
      const u = new URL(location.href);
      const id = u.searchParams.get('v') || location.pathname.split('/').pop();
      return t != null ? `https://youtu.be/${id}?t=${Math.floor(t)}` : location.href;
    },
    // YouTube captions/UI live above the video; keep the overlay under menus.
    zIndex: 2000,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    match: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/,
    videoSelectors: ['div[role="dialog"] video', 'video'],
    title: () => document.title.replace(/ \| Facebook$/, ''),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    match: /(^|\.)instagram\.com$/,
    videoSelectors: ['article video', 'section main video', 'video'],
    title: () => document.title.replace(/ • Instagram.*$/, ''),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    match: /(^|\.)tiktok\.com$/,
    videoSelectors: ['div[class*="DivVideoWrapper"] video', 'video'],
    title: () => document.title.replace(/ \| TikTok$/, ''),
  },
  {
    id: 'x',
    name: 'X / Twitter',
    match: /(^|\.)twitter\.com$|(^|\.)x\.com$/,
    videoSelectors: ['div[data-testid="videoPlayer"] video', 'video'],
    title: () => document.title.replace(/ \/ X$/, ''),
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    match: /(^|\.)vimeo\.com$/,
    videoSelectors: ['.vp-video video', 'video'],
    title: () => document.title.replace(/ on Vimeo$/, ''),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    match: /(^|\.)linkedin\.com$/,
    videoSelectors: ['video'],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    match: /(^|\.)reddit\.com$/,
    videoSelectors: ['shreddit-player video', 'video'],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    match: /(^|\.)twitch\.tv$/,
    videoSelectors: ['[data-a-target="video-player"] video', 'video'],
  },
  {
    id: 'coursera',
    name: 'Coursera',
    match: /(^|\.)coursera\.org$/,
    videoSelectors: ['video'],
  },
  {
    id: 'udemy',
    name: 'Udemy',
    match: /(^|\.)udemy\.com$/,
    videoSelectors: ['video'],
  },
  {
    id: 'netflix',
    name: 'Netflix',
    match: /(^|\.)netflix\.com$/,
    videoSelectors: ['video'],
    drm: true,
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    match: /(^|\.)primevideo\.com$|(^|\.)amazon\.[a-z.]+$/,
    videoSelectors: ['video'],
    drm: true,
  },
  {
    id: 'disneyplus',
    name: 'Disney+',
    match: /(^|\.)disneyplus\.com$/,
    videoSelectors: ['video'],
    drm: true,
  },
];

const GENERIC = {
  id: 'generic',
  name: 'This page',
  match: /.*/,
  videoSelectors: ['video'],
  title: () => document.title,
};

export function getAdapter(host = location.hostname) {
  const a = ADAPTERS.find((x) => x.match.test(host)) || GENERIC;
  return {
    ...GENERIC,
    ...a,
    title: a.title || GENERIC.title,
    permalink: a.permalink || ((t) => (t != null ? `${location.href}#t=${Math.floor(t)}` : location.href)),
  };
}

export function findVideos(adapter = getAdapter()) {
  const seen = new Set();
  const out = [];
  for (const sel of adapter.videoSelectors) {
    for (const v of document.querySelectorAll(sel)) {
      if (seen.has(v)) continue;
      seen.add(v);
      const r = v.getBoundingClientRect();
      if (r.width > 80 && r.height > 60) out.push(v);
    }
  }
  // Largest visible video first.
  return out.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  });
}

export const SITE_LIST = ADAPTERS.map((a) => ({ id: a.id, name: a.name, drm: !!a.drm }));
