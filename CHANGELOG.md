# Changelog

All notable changes to this project are listed in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-25

First public release.

### Added

- **Popup**: reads the job title, company, location and link from the current page.
  - LinkedIn and Indeed (all countries) support.
  - Any site with `JobPosting` JSON-LD structured data.
  - Page title as a fallback, with a warning to check the fields.
- **Duplicate check**: links are normalized, so a job that is already saved is shown and updated instead of saved twice.
- **5 statuses** with their own colors: Saved, Applied, Interview, Offer, Rejected.
- **Dashboard** in a full tab:
  - Filter by status with counts, search, and 7 sort options.
  - Change the status from the list, edit, delete, and add jobs by hand.
  - "Maybe follow up" hint and banner for jobs "Applied" 7+ days ago.
  - Updates by itself when a job is saved in the popup.
  - Card view on small screens.
- **CSV export** that opens correctly in Excel (UTF-8 BOM, Arabic text, protection against formula injection).
- **Light and dark mode**, following the system setting.
- **13 languages** (English, English UK, Arabic, German, Spanish, French, Indonesian, Portuguese (Brazil), Russian, Turkish, Hindi, Chinese (Simplified), Japanese), with a language picker in the dashboard, right-to-left layout for Arabic, and dates and sorting in the chosen language.
- **Arabic and right-to-left text** in all fields.
- **Styled dropdown menus** that open below the field, in the app's colors.
- **Sponsored cards**: the extension is free for everyone and shows one small card in the dashboard and one line in the popup, clearly labeled "Sponsored". Built into the extension (`shared/ads.json`), no ad network, no tracking. Never shown on websites.
- **Privacy**: data saved only in `chrome.storage.local`, only 3 permissions (`storage`, `activeTab`, `scripting`).
- Developer tools: icon maker, test pages for `core.js` and `extractor.js`, and checks for translations and ads (`tools/check-locales.js`, `tools/check-ads.js`), also run by GitHub Actions.

[1.0.0]: https://github.com/omar-diab/job-application-tracker/releases/tag/v1.0.0
