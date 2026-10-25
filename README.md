**English** | [العربية](README.ar.md)

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Job Application Tracker icon">
</p>

<h1 align="center">Job Application Tracker</h1>

<p align="center">
  Save jobs from LinkedIn, Indeed and any career site in one click, and track every application in one private dashboard.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-4f46e5" alt="Manifest V3">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tracking-none-16a34a" alt="No tracking">
  <img src="https://img.shields.io/badge/Made%20with-plain%20JavaScript-f7df1e?logo=javascript&logoColor=black" alt="Made with plain JavaScript">
  <a href="https://github.com/omar-diab/job-application-tracker/actions/workflows/check.yml"><img src="https://github.com/omar-diab/job-application-tracker/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
</p>

<p align="center">
  <img src="docs/screenshots/demo.gif" width="760" alt="Demo: saving a LinkedIn job with the popup, then opening the dashboard">
</p>

## Why this exists

When you look for a job, you apply to many places. Soon you have a spreadsheet with 50 rows, copied links, wrong statuses, and no idea who you should follow up with.

This extension does the boring part for you. Open a job post, click the icon, and the title, company, location and link are already filled in. Everything goes into one dashboard where you can see where every application stands.

## Features

- 🖱️ **One-click save**: reads the job title, company, location and link from the page.
- 🔁 **No duplicates**: if a job is already saved, the popup shows its status and lets you update it.
- 🎨 **5 colored statuses**: Saved, Applied, Interview, Offer, Rejected.
- 📋 **Dashboard**: filter by status (with counts), search, sort, edit, delete, add jobs by hand.
- ⏰ **Follow-up hint** when an application has been "Applied" for 7+ days.
- 📤 **CSV export** that opens correctly in Excel, including Arabic text.
- 🌙 **Light and dark mode**, following your system.
- 🌍 **Arabic and right-to-left text** work in every field.
- 🔒 **100% local**: no account, no server, no tracking. Your job data never leaves your computer.
- ⭐ **Optional Premium** to support the project and remove the small sponsored cards (AI features coming soon). Every feature above stays free.

## Screenshots

| Popup | Dashboard | Dashboard (dark) |
| :---: | :---: | :---: |
| <img src="docs/screenshots/popup.png" width="240" alt="Popup"> | <img src="docs/screenshots/dashboard.png" width="360" alt="Dashboard"> | <img src="docs/screenshots/dashboard-dark.png" width="360" alt="Dashboard in dark mode"> |

## Supported sites

| Site | How the job is read |
| --- | --- |
| **LinkedIn** | Job page selectors (title, company, location) |
| **Indeed** (all countries, like `ae.indeed.com`, `indeed.co.uk`) | Job page selectors |
| **Any career site with [JobPosting JSON-LD](https://schema.org/JobPosting)** (many company sites, Greenhouse, Lever, Workday, ...) | Structured data that sites publish for Google |
| **Any other page** | The page title, so you can still save it and fix the fields |

A site doesn't read correctly? [Open a "Site not working" issue](https://github.com/omar-diab/job-application-tracker/issues/new/choose).

## Privacy

Your job data never leaves your computer.

- Jobs are saved only in `chrome.storage.local`, inside your browser. They are never sent anywhere.
- No account, no analytics, no tracking, no ad networks.
- The free version shows **small sponsored cards** inside the extension (never on websites). They are built into the extension and track nothing. Premium removes them.
- The page is read **only when you click the icon**.

The extension asks for only 3 permissions:

| Permission | Why |
| --- | --- |
| `storage` | Save your jobs on your computer. |
| `activeTab` | Read the tab you are on, only after you click the icon. No access to "all websites". |
| `scripting` | Run the small page reader in that tab to find the job details. |

### Premium and payments

- Payments are handled by **[Dodo Payments](https://dodopayments.com)** (merchant of record). **We never see your card details.**
- After you pay, Dodo emails you a **license key**. You paste it in the Premium window.
- The extension talks to Dodo only to check this license key: when you enter it, and at most once every 12 hours. Your jobs and notes are never sent.

Read the full [privacy policy](PRIVACY.md).

## Install from the Chrome Web Store

Coming soon: [Job Application Tracker on the Chrome Web Store](https://chromewebstore.google.com/detail/REPLACE_WITH_EXTENSION_ID)

## Install for developers

1. Download this repository: **Code → Download ZIP** (and unzip it), or:
   ```bash
   git clone https://github.com/omar-diab/job-application-tracker.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the project folder (the one with `manifest.json`).
5. Pin the extension: click the puzzle icon 🧩 in the toolbar, then the pin 📌.

No build step and no `npm install`. The code runs as it is.

## How to use

1. Open a job post (LinkedIn, Indeed or a company career page).
2. Click the extension icon. Check the fields, choose a status, add notes.
3. Click **Save job**.
4. Click **Dashboard ↗** to see all your jobs. Change a status right from the list.
5. Click **Export CSV** to open your list in Excel or Google Sheets.

## Project structure

```
job-application-tracker/
├── manifest.json            Extension settings and the 3 permissions
├── _locales/                Translations (one messages.json per language)
├── icons/                   Extension icons (16, 48, 128 px), and icons/ads/ for ad images
├── shared/
│   ├── base.css             Shared design: colors, dark mode, status colors, fields, buttons
│   ├── i18n.js              Translations: t(), language picker, right-to-left
│   ├── core.js              Statuses, safe h() element helper, dates, links, jobs, storage
│   ├── extractor.js         Reads the job from a page (LinkedIn, Indeed, JSON-LD, title)
│   ├── premium.js           Premium: plans, Dodo checkout, license key activation and checks
│   ├── ads.js               Sponsored cards for free users (no tracking, no ad network)
│   └── ads.json             The list of sponsored cards (edit this file to change the ads)
├── popup/
│   ├── popup.html           The popup window
│   ├── popup.css            Popup styles
│   └── popup.js             Reads the tab, checks duplicates, saves the job
├── dashboard/
│   ├── dashboard.html       The full-page dashboard
│   ├── dashboard.css        Dashboard styles, phone card view, dialog
│   └── dashboard.js         List, filters, search, sort, add/edit dialog, CSV export
├── tools/                   Helpers for developers (NOT part of the extension)
│   ├── make-icons.html/.js  Draws the icons and downloads them as PNG
│   ├── test-core.html/.js   Tests for shared/core.js, premium.js and ads.js
│   ├── test-extractor.html/.js  Tests for shared/extractor.js
│   ├── check-locales.js     Checks all translations (node tools/check-locales.js)
│   └── check-ads.js         Checks shared/ads.json (node tools/check-ads.js)
└── docs/screenshots/        Images for this README
```

## How it works

```
Click icon → popup.js → chrome.scripting.executeScript(extractJobInfo) → reads the job page
          → core.js cleans the data and checks for duplicates → chrome.storage.local
          → dashboard.js listens to chrome.storage.onChanged → the list updates by itself
```

- `extractJobInfo` is fully self-contained, because Chrome copies only that one function into the page.
- All text is added with `textContent` (through a small `h()` helper), never `innerHTML`, so a job title can never inject HTML.
- Links are normalized (`/jobs/view/123/`, `?jk=...`, tracking parameters removed), so the same job is never saved twice.
- **Premium:** the license key is activated with Dodo Payments' public license API (no secret key in the extension) and the result is saved in `chrome.storage.local`. The popup and the dashboard read this saved value, so they open fast and work offline.

## Running the tests

There is nothing to install. Open these files in Chrome:

- `tools/test-core.html` tests links, dates, jobs, storage and the `h()` helper.
- `tools/test-extractor.html` tests LinkedIn, Indeed, JSON-LD, Arabic text and broken pages.

Every line should be green, with a total like **17 / 17 tests passed** at the top.

Run `node tools/check-locales.js` and `node tools/check-ads.js` to check the translations and the ads.

On every push, GitHub Actions also checks `manifest.json`, the JavaScript syntax, the permissions, the translations and the ads.

## Sponsored cards (free version)

Free users see **one** small card marked **"Sponsored"**: in the dashboard (above the list, or in the empty state) and as one line at the bottom of the popup. Premium users never see them.

- The cards are listed in [`shared/ads.json`](shared/ads.json), inside the extension. There is **no ad network**, no code from the internet, no tracking and no cookies.
- Cards are **never** shown on LinkedIn, Indeed or any other website.
- Each card: `id`, `title`, `text`, `url` (or `"#premium"` to open the Premium window), `cta` (button text), optional `image` (a file in `icons/ads/`), optional `languages` (like `["ar"]`) and optional `endDate` (like `"2027-12-31"`).
- After editing `ads.json`, run `node tools/check-ads.js`. Changes reach users with the next release.

## Roadmap

Ideas for the future. Feedback is welcome!

- 🗓️ Interview dates and reminders (planned)
- 📥 Import from CSV, backup and restore (planned)
- 🌐 More job sites: Bayt, Glassdoor, Wellfound, Naukrigulf (planned)
- 🇸🇦 Arabic interface (planned)
- 🦊 Firefox version (planned)

## Contributing

Contributions are welcome, especially **selector updates when LinkedIn or Indeed change their pages**. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

Found a security problem? Please read [SECURITY.md](SECURITY.md) and report it privately.

## License

[MIT](LICENSE) © 2026 Omar Diab
