# Privacy Policy

**Job Application Tracker** · Last updated: 25 October 2026

Job Application Tracker is a Chrome extension that helps you save and track your job applications. It was built to respect your privacy.

## The short version

**Your job data stays on your computer.** It is never sent to us or to anyone else.
The only online service is **Dodo Payments**, and only for the optional Premium plan.

## What the extension stores

The extension saves the jobs you choose to save: job title, company, location, link, status, notes and dates.

- This data is saved **only** in `chrome.storage.local`, inside your own Chrome browser, on your computer.
- It is **never sent** to us, to Dodo Payments, or to anyone else.
- Your language choice, your Premium status and your license key are also saved on your computer.

## What the extension does NOT do

- No analytics, no tracking, no ads, no cookies.
- Your job data is never sold, shared or sent over the internet.
- No remote code is loaded. All code is inside the extension.

## When a web page is read

The extension reads a page **only when you click its icon**, and only the tab you are looking at. It looks for the job title, company and location on that page, and shows them to you in the popup. Nothing is saved until you click **Save job**.

## Premium and payments

Premium is optional. All the main features are free.

- Payments are handled by **[Dodo Payments](https://dodopayments.com)**, which acts as the merchant of record (it sells Premium for us and handles taxes).
- **We never see your card details.** You type them on Dodo's secure payment page.
- Dodo Payments stores **the email address and payment details you give them**, to process the purchase and to send you your **license key**. See the [Dodo Payments privacy policy](https://dodopayments.com/privacy-policy).
- To check your license key, the extension talks to Dodo Payments (`dodopayments.com`):
  - when you enter your license key,
  - at most once every 12 hours after that, to know if your subscription is still active,
  - and when you remove the license from your computer.
- These requests contain **only your license key and a random activation id**. **They never contain your jobs, notes or any page you visited.**
- Your license key is saved only in `chrome.storage.local` on your computer.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | To save your jobs and settings on your computer. |
| `activeTab` | To read the current tab, only after you click the extension icon. |
| `scripting` | To run the small page reader in that tab and find the job details. |

The extension does **not** ask for access to all websites, your browsing history or your downloads.

## CSV export

When you click **Export CSV**, the file is created on your computer and saved like any normal download. It is not uploaded anywhere.

## Deleting your data

- Delete one job with the **Delete** button in the dashboard.
- **Uninstalling the extension deletes all saved data** from your browser.
- To delete your purchase data at Dodo Payments, contact Dodo Payments.

## Changes to this policy

If this policy changes, the new version will be published in this file with a new date.

## Contact

Questions? Open an issue on [GitHub](https://github.com/omar-diab/job-application-tracker/issues).
