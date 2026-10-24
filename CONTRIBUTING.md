# Contributing

Thank you for helping! Bug reports, ideas and pull requests are all welcome.

**Selector updates are especially welcome.** LinkedIn and Indeed change their pages often. When they do, the extension may stop reading a field. A small pull request that fixes a selector helps everyone.

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
