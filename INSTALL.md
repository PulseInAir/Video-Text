# Installing Video Text

It's not on the Chrome Web Store, so you load it as an **unpacked extension** —
a normal, supported Chrome feature. Takes about a minute.

Works in Chrome, Edge, Brave, Opera, Vivaldi, Arc — anything Chromium-based,
version **116 or newer**.

---

## Step 1 — get the folder onto your computer

**Option A — download the zip (no git needed)**

Download **`video-text-extension.zip`** from the repo, then **unzip it**.
You should end up with a folder that has `manifest.json` sitting directly
inside it.

> Chrome loads a *folder*, not a zip. If you point it at the zip file, or at a
> folder that merely *contains* another folder, it will refuse.

**Option B — clone the repo**

```bash
git clone https://github.com/PulseInAir/Video-Text.git
cd Video-Text
git checkout arena/01a067a1-video-text
```

The folder you'll select is `Video-Text/ext`.

## Step 2 — open the extensions page

Go to **`chrome://extensions`** (paste it in the address bar).

Other browsers:
- Edge → `edge://extensions`
- Brave → `brave://extensions`
- Opera → `opera://extensions`

## Step 3 — turn on Developer mode

Toggle **Developer mode**, top-right of that page. Three buttons appear.

## Step 4 — Load unpacked

Click **Load unpacked** and select:

- the **unzipped folder** (Option A), or
- the **`ext`** folder inside the repo (Option B)

Select the folder itself — don't open it and pick a file.

**Video Text** now appears in your list. ✅

## Step 5 — pin it

Click the puzzle-piece icon in the toolbar, then the pin next to **Video Text**
so the icon stays visible.

---

## Try it

1. Open any video — YouTube, TikTok, X, a course page, anything with a video
2. Press **`Alt`+`S`** (or click the icon → **Select text**)
3. A box appears over the subtitle area — drag it where you want
4. Hit **Grab text**

The first grab takes a few seconds while the OCR engine warms up; every one
after that is fast. Everything runs on your machine — no account, no API key,
and no frame ever leaves your browser.

---

## Troubleshooting

**"Manifest file is missing or unreadable"**
You selected the wrong folder. The folder you pick must contain `manifest.json`
directly. If you unzipped and got `video-text-extension/ext/...`, pick the
inner `ext`.

**"This extension may have been corrupted"**
Usually a partial unzip. Delete the folder, unzip again, reload.

**The icon is there but nothing happens on a page**
Chrome blocks extensions on its own pages — `chrome://`, the Web Store, and
other extensions' pages. Try an ordinary website. Also reload any tab that was
already open *before* you installed.

**"No video found on this page"**
Start playback first, then press `Alt`+`S`. Some sites only create the player
once you hit play.

**Nothing happens on Netflix / Prime Video / Disney+**
Expected. Those use DRM playback that hands back blank pixels to *any*
extension — a browser-level protection nothing can work around. The extension
tells you rather than saving empty text.

**`Alt`+`S` does nothing**
Another extension may have claimed the shortcut. Rebind it at
`chrome://extensions/shortcuts`.

**The text came out wrong**
OCR struggles with compressed or small text. Open **Settings** and raise
**Upscale** to 3–4×, set **Layout** to *Single line* for one-line subtitles,
and keep **Contrast boost** on. Drawing a tighter box around just the text
helps most of all.

---

## Updating

Replace the folder contents (or `git pull`), then hit the **↻ reload** icon on
the extension's card at `chrome://extensions`.

## Removing it

**Remove** on the card at `chrome://extensions`. Your saved captures live in
local browser storage and go with it.

---

### A note on "Developer mode"

Chrome may warn about running extensions in developer mode. That's the generic
notice for any extension not installed from the Web Store — it isn't about this
code specifically. Everything here runs locally with no network access; you can
read every line in `ext/`.
