# Contributing

Thank you for helping! Bug reports, ideas and pull requests are all welcome.

**Selector updates are especially welcome.** LinkedIn and Indeed change their pages often. When they do, the extension may stop reading a field. A small pull request that fixes a selector helps everyone.

## Versions and branches

- **Released versions** are on the [Releases](https://github.com/omar-diab/Job-Application-Tracker/releases) page. Each release has a zip with only the extension files (built by `.github/workflows/release.yml` when a tag like `v1.0.0` is pushed).
- **`main`** is the development version. It can contain work that is not released yet.

## How it works

```
Click icon → popup.js → chrome.scripting.executeScript(extractJobInfo) → reads the job page
          → core.js cleans the data and checks for duplicates → chrome.storage.local
          → dashboard.js listens to chrome.storage.onChanged → the list updates by itself
```

- `extractJobInfo` is fully self-contained, because Chrome copies only that one function into the page.
- All text is added with `textContent` (through the `h()` helper), never `innerHTML`.
- Links are normalized (`/jobs/view/123/`, `?jk=...`, tracking parameters removed), so the same job is never saved twice.
- Translations use Chrome's `_locales` format and are loaded by `shared/i18n.js`, so the user can choose the language.

## Project structure

```
job-application-tracker/
├── manifest.json            Extension settings and the 3 permissions
├── _locales/                Translations (one messages.json per language)
├── icons/                   Extension icons (16, 48, 128 px), and icons/ads/ for ad images
├── shared/
│   ├── base.css             Shared design: colors, dark mode, status colors, menus, buttons
│   ├── i18n.js              Translations: t(), language picker, right-to-left
│   ├── core.js              Statuses, safe h() element helper, dates, links, jobs, storage
│   ├── extractor.js         Reads the job from a page (LinkedIn, Indeed, JSON-LD, title)
│   ├── ads.js               Sponsored cards (no tracking, no ad network)
│   ├── ads.json             The list of sponsored cards
│   └── premium.js           Premium plan (Dodo Payments license keys), development only
├── popup/                   The popup window (html, css, js)
├── dashboard/               The full-page dashboard (html, css, js)
├── tools/                   Helpers for developers (NOT part of the extension)
│   ├── make-icons.html/.js  Draws the icons and downloads them as PNG
│   ├── test-core.html/.js   Tests for core.js, i18n.js, premium.js and ads.js
│   ├── test-extractor.html/.js  Tests for extractor.js
│   ├── check-locales.js     Checks all translations (node tools/check-locales.js)
│   └── check-ads.js         Checks shared/ads.json (node tools/check-ads.js)
├── docs/screenshots/        Images for the README
└── docs/store/              Chrome Web Store screenshots (1280×800)
```

## Sponsored cards (`shared/ads.json`)

- The cards are inside the extension: no ad network, no code from the internet, no tracking, no cookies. They are **never** shown on other websites.
- Each card: `id`, `title`, `text`, `url` (or `"#premium"` to open the Premium window), `cta` (button text), optional `image` (a file in `icons/ads/`), optional `languages` (like `["ar"]`) and optional `endDate` (like `"2027-12-31"`).
- After editing `ads.json`, run `node tools/check-ads.js`. Changes reach users with the next release.

## Run the extension locally

1. Fork and clone the repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and choose the project folder (the one with `manifest.json`).
4. After you change a file, click the **reload ↻** button on the extension card, then reopen the popup or the dashboard.

To see errors:

- **Popup:** right-click inside the popup → **Inspect** → **Console**.
- **Dashboard:** right-click the page → **Inspect** → **Console**.
- **chrome://extensions:** the **Errors** button on the extension card.

## Code rules

- **Plain HTML, CSS and JavaScript.** No frameworks, no build tools, no npm packages.
- **Never put user or page text into the page with `innerHTML`.** Use `textContent`, or the `h()` helper from `shared/core.js`, which always adds text safely.
- **No inline scripts or `style=""`.** Manifest V3 blocks inline scripts. Put code in `.js` files and styles in `.css` files.
- **Only 3 permissions:** `storage`, `activeTab`, `scripting`. Pull requests that add permissions or host permissions will not be accepted. A GitHub Action checks this.
- **Data stays local.** Use `chrome.storage.local` only. No servers, no analytics, no remote code.
- **Style:** 2 spaces, single quotes, semicolons, `'use strict'`, and a short comment above each function (see `.editorconfig`).
- **Simple English** in comments and in the interface.

## Run the tests

No installation needed. Open these files directly in Chrome:

- `tools/test-core.html`: links, dates, jobs, storage and `h()`.
- `tools/test-extractor.html`: the page reader, with fake LinkedIn, Indeed and JSON-LD pages.

All lines must be green. If you change `shared/core.js` or `shared/extractor.js`, please add a test for your change.

## Add support for a new job site

All page reading happens in **`shared/extractor.js`**, in the function `extractJobInfo`.

> **Important:** `extractJobInfo` must stay **self-contained**. Chrome copies only this one function into the job page, so it cannot use anything from `core.js` or any variable outside the function. Put every helper inside it.

1. **Check JSON-LD first.** Many sites already publish `JobPosting` data. Open the job page, then in the Console run:
   ```js
   document.querySelectorAll('script[type="application/ld+json"]')
   ```
   If the site has a `JobPosting`, the extension probably reads it already.
2. **Find the selectors.** Right-click the job title on the page → **Inspect**. Choose a stable selector: `data-testid` and similar attributes are better than long, generated class names.
3. **Add a block** next to the LinkedIn and Indeed blocks (search for `// Step 1: LinkedIn page.`):
   - Detect the site with its hostname.
   - Use `firstText([...])` with a **list** of selectors, newest first, so older page versions still work.
   - Set `result.method` to a short name for the site.
4. **Add a test** in `tools/test-extractor.js`: a small fake page with the same HTML structure, and the expected result.
5. **Update the "Supported sites" table** in `README.md` and `README.ar.md`.

### Fix a LinkedIn or Indeed selector

The selector lists are in `shared/extractor.js` under `// Step 1: LinkedIn page.` and `// Step 2: Indeed page.` Add the new selector at the **top** of the list, and keep the old ones, because some users still see the older page.

## Pull requests

- Keep each pull request small and about one thing.
- Fill in the checklist in the pull request template.
- If you change something users can see, add a line to `CHANGELOG.md`.
