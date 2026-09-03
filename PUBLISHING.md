# Publishing to the Chrome Web Store

Everything Google asks for, and where to get it. Budget **$5 once** and about
an hour of form-filling.

---

## 1. Create a developer account

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with the Google account that should own the listing — use a
   dedicated account if this is for a business, because **the owner cannot be
   changed later without a transfer**
3. Accept the developer agreement
4. Pay the **one-time $5 USD** registration fee by card

That fee is per account, not per extension, and never renews.

## 2. Build the upload package

```bash
npm run build:zip
```

This produces `video-text-extension.zip` from `ext/`, with `manifest.json` at
the **root of the archive** (Google rejects packages where the manifest sits
inside a nested folder).

## 3. Fill in the listing

Copy-paste values are in **[store/listing.md](store/listing.md)**.

| Field | Where it comes from |
| --- | --- |
| Name | `Video Text — Overlay Text Extractor` |
| Short description | ≤132 chars — already set in `manifest.json` |
| Detailed description | `store/listing.md` |
| Category | Productivity → Workflow & Planning |
| Language | English |
| Icon | `ext/icons/icon128.png` |
| Screenshots | **You must create these** — see below |
| Small promo tile | `store/promo-440x280.png` |
| Privacy policy URL | Your hosted copy of `site/privacy.html` |

### Screenshots — the one thing you have to do yourself

Google requires **at least one** screenshot at **1280×800** (or 640×400), and
it must show the **real extension UI**, not a marketing graphic. These have to
come from your machine, because this repo was built in a sandbox with no
browser.

Take four:

1. The selection overlay on a YouTube video, box over the subtitles
2. The results panel with extracted text visible
3. The library page with several captures
4. The export dropdown showing the format list

Crop to exactly 1280×800:

```bash
magick screenshot.png -resize 1280x800^ -gravity center -extent 1280x800 shot-1.png
```

## 4. Privacy tab

This is where most first submissions fail. Be exact.

- **Single purpose:** *Extracts text that is visually displayed inside videos
  and lets the user copy or export it.*
- **Permission justifications:** copy them from `store/listing.md` — one line
  per permission, already written to match the code
- **Data usage:** tick **nothing**. The extension genuinely collects no data.
  Then certify all three limited-use statements
- **Privacy policy URL:** required. Host `site/privacy.html` at a stable HTTPS
  address and paste the link

> Your privacy policy must be reachable in an incognito window. A GitHub Pages
> URL is fine.

## 5. Submit

Choose **Public**, then **Submit for review**.

**Expect 1–3 business days.** This extension declares no broad
`host_permissions`, which avoids the slowest review tier — but its content
script still matches all sites, so a reviewer may ask why. The answer, already
written into the listing: *a video can be on any website, and the overlay is
purely local UI that reads nothing from the page.*

---

## Hosting the privacy policy (free, 5 minutes)

Google requires a public HTTPS URL. Use GitHub Pages:

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save, wait a minute

Your files are then at:

- `https://<user>.github.io/Video-Text/site/index.html` — landing page
- `https://<user>.github.io/Video-Text/site/privacy.html` — **privacy policy URL**

(Pages serves from `main`, so merge this branch first.)

---

## Likely review questions, and the honest answers

**"Why does the content script run on all sites?"**
A video can appear anywhere. The script only draws a selection overlay when the
user presses a shortcut or clicks the icon; it never reads or transmits page
content. There are no `host_permissions`, so nothing is accessible until the
user invokes the extension on that tab.

**"Why is the package ~17 MB?"**
The OCR engine and English language model are bundled so recognition works
offline. Manifest V3 forbids fetching remote code, and shipping it locally is
also the reason no user data ever leaves the device.

**"Is the minified vendor code yours?"**
No — it's [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0),
vendored unmodified in `ext/vendor/`. Point reviewers at the upstream project
if asked; unexplained minified code is a common rejection trigger.

---

## After approval

- Install from the store and confirm the published build actually works
- Add the store link to `site/index.html` (replace the "Download" button) and
  to the README
- Bump `version` in `manifest.json` for every update — the store rejects
  re-uploads of an existing version number

## Alternatives with no fee

| Store | Fee | Notes |
| --- | --- | --- |
| Microsoft Edge Add-ons | Free | Accepts the same MV3 zip, no changes needed |
| Firefox Add-ons | Free | Needs manifest tweaks; offscreen API is unsupported |

Edge is worth doing — it's the same package, and Chrome extensions install on
Edge from that store.
