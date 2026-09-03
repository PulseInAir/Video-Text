# Store listing — copy/paste values

Everything below is ready to paste into the Chrome Web Store developer
dashboard. Character counts are current as of writing.

---

## Name (75 char limit)

```
Video Text — Overlay Text Extractor
```

## Short description (132 char limit — currently 129)

```
Extract on-screen text from any video — subtitles, slides, captions. Works on YouTube, TikTok, X and more. Export TXT, SRT, DOCX.
```

## Category

**Productivity** → Workflow & Planning

## Language

English (United States)

---

## Detailed description

```
Text inside a video isn't really text. You can't select it, search it, or quote it — you retype it by hand, pausing and scrubbing until you've got it right.

Video Text fixes that. Draw a box over any part of a video and get real, copyable text out of it.

━━━━━━━━━━━━━━━━━━━━━━

HOW IT WORKS

1. Open any video and press Alt+S
2. A selection box appears over the subtitle area — drag or resize it
3. Click "Grab text"
4. Copy it, edit it, or save it to your library

That's the whole thing. No account, no sign-up, no setup.

━━━━━━━━━━━━━━━━━━━━━━

WHAT YOU CAN DO

• Select any region of a video, like a screenshot — but you get text
• Build a full transcript with Auto mode, which reads subtitles as they appear and skips repeats
• Edit any result inline — OCR isn't perfect, and fixing a character shouldn't mean starting over
• Keep everything in a searchable local library, filtered by site
• Jump back to the exact second a capture came from
• Export in eight formats

━━━━━━━━━━━━━━━━━━━━━━

EXPORT FORMATS

.srt and .vtt — real subtitle files with timings taken from the video, ready for VLC, Premiere or YouTube's caption editor
.docx — Word documents
.txt, .md, .csv, .json, .html — everything else

━━━━━━━━━━━━━━━━━━━━━━

WHERE IT WORKS

Tuned for YouTube, Facebook, Instagram, TikTok, X (Twitter), Vimeo, Twitch, Reddit, LinkedIn, Coursera and Udemy — plus a generic mode that handles any other page with a standard HTML5 video.

Note: DRM-protected services (Netflix, Prime Video, Disney+) hand back blank pixels to every browser extension. That's a protection built into Chrome itself, and no extension can work around it. Video Text tells you clearly instead of silently saving an empty result.

━━━━━━━━━━━━━━━━━━━━━━

PRIVACY — THIS ONE IS DIFFERENT

Most OCR tools upload your frames to a server. This one cannot.

The recognition engine and its language model are bundled inside the extension and run in your browser, offline. Video Text makes no network requests at all — no account, no analytics, no telemetry, no third-party services. Your captures are stored locally on your own machine.

The extension requests no broad website permissions. It only acts on the tab you're on, and only after you invoke it.

It is free, open source and MIT licensed. You can read every line:
https://github.com/PulseInAir/Video-Text

━━━━━━━━━━━━━━━━━━━━━━

GOOD FOR

Students pulling notes off lecture slides · Journalists quoting clips accurately · Developers copying code out of screencasts · Translators working from hardcoded subtitles · Anyone who has ever paused a video to retype what's on screen
```

---

## Single purpose (required field)

```
Extracts text that is visually displayed inside videos — such as subtitles, captions and on-screen slides — and lets the user copy or export it.
```

---

## Permission justifications

Paste each into its field on the **Privacy practices** tab. These describe what
the code actually does; keep them accurate if the code changes.

**activeTab**
```
Used to display the text-selection overlay on the video the user is currently watching. Access is granted only when the user explicitly invokes the extension via the toolbar icon, the Alt+S keyboard shortcut, or the right-click menu.
```

**scripting**
```
Used to inject the selection overlay UI into the active tab when the user activates the extension. Only the extension's own bundled content script and stylesheet are injected; no remote code is ever loaded or executed.
```

**storage**
```
Stores the user's extracted text captures locally (chrome.storage.local) and their preferences such as OCR language and image upscale factor (chrome.storage.sync). No data is transmitted anywhere.
```

**offscreen**
```
Hosts the optical character recognition engine. Manifest V3 service workers cannot reliably run the WebAssembly worker required for OCR, so recognition is performed in an offscreen document. The engine is bundled in the extension and runs entirely locally.
```

**downloads**
```
Saves the user's exported file (.txt, .srt, .vtt, .docx, .md, .csv, .json or .html) when they click Export. The file is generated locally in the browser and written directly to the user's device.
```

**clipboardWrite**
```
Copies extracted text to the clipboard when the user clicks the Copy button.
```

**contextMenus**
```
Adds an "Extract text from this video" item to the right-click menu as an alternative way to start a selection.
```

**Content script matching all URLs** (explain in reviewer notes)
```
Videos can appear on any website, so the content script must be registered broadly to make the overlay available wherever the user is watching. It renders a local selection UI only — it does not read, collect, or transmit page content. The extension deliberately declares no host_permissions, so it has no standing access to any site; the overlay activates only on the tab the user explicitly invokes it on.
```

---

## Data usage disclosures

Tick **nothing**. Then certify all three:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Assets

| Asset | Size | Status |
| --- | --- | --- |
| Icon | 128×128 | `ext/icons/icon128.png` ✅ |
| Small promo tile | 440×280 | `store/promo-440x280.png` ✅ |
| Screenshots | 1280×800 | **You must capture these** — see PUBLISHING.md |
| Marquee promo tile | 1400×560 | Optional, only for homepage features |

## URLs

| Field | Value |
| --- | --- |
| Homepage | `https://github.com/PulseInAir/Video-Text` |
| Privacy policy | Your hosted `site/privacy.html` — **required** |
| Support | `https://github.com/PulseInAir/Video-Text/issues` |
