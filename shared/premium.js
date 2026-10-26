// Premium plan with Dodo Payments and license keys.
//
// How it works:
// 1. The user clicks a plan. The Dodo checkout page opens in a new tab.
// 2. After paying, Dodo emails a license key to the user.
// 3. The user pastes the key in the Premium window. We "activate" it with Dodo
//    (one activation = one computer), and save the result on this computer.
// 4. At most once every 12 hours we ask Dodo if the key is still valid.
//    When the subscription ends, Dodo disables the key, and Premium turns off.
//
// The Premium status is saved in chrome.storage.local under "license":
//   { premium, licenseKey, instanceId, checkedAt }
// So the popup and the dashboard know it at once, without waiting for the internet.
//
// The license endpoints of Dodo are public: no secret API key is needed (or used) here.

'use strict';

// 'test' while testing (test cards, no real money), 'live' for real payments.
// Live mode has its own products: when you switch, also update the product ids below.
const DODO_MODE = 'test';

const DODO_HOSTS = Object.freeze({
  test: Object.freeze({ api: 'https://test.dodopayments.com', checkout: 'https://test.checkout.dodopayments.com' }),
  live: Object.freeze({ api: 'https://live.dodopayments.com', checkout: 'https://checkout.dodopayments.com' })
});

// The plans. Keep the prices the same as the products in the Dodo dashboard.
const PREMIUM_PLANS = Object.freeze([
  Object.freeze({
    id: 'monthly',
    productId: 'pdt_0NqVYdA38JTqzxHUrZPli',
    unitAmountCents: 499,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1
  }),
  Object.freeze({
    id: 'yearly',
    productId: 'pdt_0NqVYvmMPs2PdlLS7bv37',
    unitAmountCents: 4999,
    currency: 'usd',
    interval: 'year',
    intervalCount: 1
  })
]);

const LICENSE_KEY = 'license';

// Check the license online at most once every 12 hours.
const LICENSE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// The name of this activation, shown in the Dodo dashboard.
const ACTIVATION_NAME = 'Job Application Tracker (Chrome)';

function dodoHosts() {
  return DODO_HOSTS[DODO_MODE];
}

// The saved license, or null.
async function readLicense() {
  try {
    const result = await chrome.storage.local.get(LICENSE_KEY);
    const license = result[LICENSE_KEY];
    return license && typeof license === 'object' ? license : null;
  } catch (error) {
    console.warn('Could not read the license:', error);
    return null;
  }
}

async function saveLicense(license) {
  await chrome.storage.local.set({ [LICENSE_KEY]: license });
  return license;
}

// Fast: reads only the saved status. No internet needed.
async function isPremium() {
  const license = await readLicense();
  return Boolean(license && license.premium);
}

// Sends a request to a Dodo license endpoint. Returns { ok, status, data }.
// Throws only on a network error (no internet).
async function callLicenseApi(action, body) {
  const response = await fetch(dodoHosts().api + '/licenses/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data: data };
}

// An error with a code the page can translate:
// 'empty', 'not_found', 'inactive', 'limit', 'network'.
function licenseError(code) {
  const error = new Error('License error: ' + code);
  error.code = code;
  return error;
}

// Activates a license key on this computer and saves Premium.
// Throws a licenseError() if it does not work.
async function activateLicense(rawKey) {
  const licenseKey = String(rawKey || '').trim();
  if (!licenseKey) {
    throw licenseError('empty');
  }

  let result;
  try {
    result = await callLicenseApi('activate', { license_key: licenseKey, name: ACTIVATION_NAME });
  } catch (error) {
    throw licenseError('network');
  }

  if (result.status === 404) {
    throw licenseError('not_found');
  }
  if (result.status === 403) {
    throw licenseError('inactive');
  }
  if (result.status === 422) {
    throw licenseError('limit');
  }
  if (!result.ok || !result.data || !result.data.id) {
    throw licenseError('network');
  }

  return saveLicense({
    premium: true,
    licenseKey: licenseKey,
    instanceId: result.data.id,
    checkedAt: new Date().toISOString()
  });
}

// Only one check at a time, even if the popup and the dashboard ask together.
let refreshing = null;

// Asks Dodo if the saved license key is still valid, and saves the answer.
// - Does nothing for free users (no key saved).
// - Skipped if the last check is younger than 12 hours (unless options.force is true).
// - If there is no internet or Dodo has a problem, the saved status is KEPT.
//   We never remove Premium because of a network problem.
async function refreshLicense(options) {
  const force = Boolean(options && options.force);
  const saved = await readLicense();
  if (!saved || !saved.licenseKey) {
    return saved;
  }
  const age = saved.checkedAt ? Date.now() - Date.parse(saved.checkedAt) : Infinity;
  if (!force && age < LICENSE_MAX_AGE_MS) {
    return saved;
  }
  if (refreshing) {
    return refreshing;
  }

  refreshing = (async function () {
    try {
      const result = await callLicenseApi('validate', {
        license_key: saved.licenseKey,
        license_key_instance_id: saved.instanceId
      });
      if (!result.ok || !result.data || typeof result.data.valid !== 'boolean') {
        // A problem on Dodo's side (for example 500 or 429): keep the saved status.
        return saved;
      }
      return await saveLicense(Object.assign({}, saved, {
        premium: result.data.valid,
        checkedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('Could not check the license. Keeping the saved status.', error);
      return saved;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Removes the license from this computer, so it can be used on another one.
// Frees the activation at Dodo when possible; the local license is removed in any case.
async function removeLicense() {
  const saved = await readLicense();
  if (saved && saved.licenseKey && saved.instanceId) {
    try {
      await callLicenseApi('deactivate', {
        license_key: saved.licenseKey,
        license_key_instance_id: saved.instanceId
      });
    } catch (error) {
      console.warn('Could not free the activation at Dodo:', error);
    }
  }
  await chrome.storage.local.remove(LICENSE_KEY);
}

// The plans to show in the Premium window.
function loadPlans() {
  return PREMIUM_PLANS;
}

// Opens the Dodo checkout page for a plan in a new tab.
async function openUpgrade(planId) {
  const plan = PREMIUM_PLANS.find(function (p) {
    return p.id === planId;
  }) || PREMIUM_PLANS[0];
  const url = dodoHosts().checkout + '/buy/' + encodeURIComponent(plan.productId) + '?quantity=1';
  await chrome.tabs.create({ url: url });
}

// "ABCD-1234-EFGH-5678" → "•••• 5678", so the full key is not shown on screen.
function maskLicenseKey(licenseKey) {
  const key = String(licenseKey || '');
  return key.length > 4 ? '•••• ' + key.slice(-4) : key;
}

// Calls callback(premium, license) every time the saved status changes
// (after an activation, a removal, or a check in another tab).
function onPremiumChange(callback) {
  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local' && changes[LICENSE_KEY]) {
      const license = changes[LICENSE_KEY].newValue || null;
      callback(Boolean(license && license.premium), license);
    }
  });
}
