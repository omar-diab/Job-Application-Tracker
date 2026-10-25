// "Sponsored" cards for FREE users, shown only inside our own popup and dashboard.
//
// Rules (Chrome Web Store policy):
// - Never on LinkedIn, Indeed or any other website. Only in our own pages.
// - No ad network and no code from the internet: the ads are in shared/ads.json,
//   inside the extension, and images are local files in icons/ads/.
// - Always labeled "Sponsored". No tracking, no cookies, nothing is sent anywhere.
// - A card never covers content and never pops up.
//
// Load this file after i18n.js, core.js and premium.js. Then:
//   showAds(container, { compact: false, onRemoveAds: openPremiumDialog });

'use strict';

const ADS_FILE = 'shared/ads.json';

// The id of the last ad shown, so the next one is different. Saved only on this computer.
const ADS_LAST_KEY = 'ads.lastShown';

// An ad with this url opens the Premium window instead of a website.
const PREMIUM_AD_URL = '#premium';

// Ad images must be local files in icons/ads/.
const AD_IMAGE_PATTERN = /^icons\/ads\/[a-z0-9_-]+\.(png|jpg|jpeg|webp|svg)$/i;

let adsCache = null;

// True if an ad from ads.json has everything it needs and nothing unsafe.
function isValidAd(ad) {
  return Boolean(ad) &&
    typeof ad.id === 'string' && ad.id !== '' &&
    typeof ad.title === 'string' && ad.title.trim() !== '' &&
    typeof ad.cta === 'string' && ad.cta.trim() !== '' &&
    (ad.text === undefined || typeof ad.text === 'string') &&
    (ad.url === PREMIUM_AD_URL || safeHref(ad.url) !== null) &&
    (ad.image === undefined || AD_IMAGE_PATTERN.test(ad.image)) &&
    (ad.endDate === undefined || isDateStr(ad.endDate)) &&
    (ad.languages === undefined || Array.isArray(ad.languages));
}

// Loads shared/ads.json once (from inside the extension, not from the internet).
async function loadAds() {
  if (adsCache) {
    return adsCache;
  }
  try {
    const response = await fetch(chrome.runtime.getURL(ADS_FILE));
    const data = await response.json();
    adsCache = Array.isArray(data) ? data.filter(isValidAd) : [];
  } catch (error) {
    console.warn('Could not load the ads:', error);
    adsCache = [];
  }
  return adsCache;
}

// Keeps the ads that have not ended and that are for this language.
// An ad without "languages" is for everyone. "en" also matches "en_GB".
function filterAds(ads, lang, today) {
  const base = String(lang).split('_')[0];
  return ads.filter(function (ad) {
    if (ad.endDate && ad.endDate < today) {
      return false;
    }
    if (Array.isArray(ad.languages) && ad.languages.length) {
      return ad.languages.includes(lang) || ad.languages.includes(base);
    }
    return true;
  });
}

// Picks a random ad, but not the one shown last time (unless it is the only one).
function chooseAd(ads, lastId, random) {
  if (!ads.length) {
    return null;
  }
  const choices = ads.length > 1
    ? ads.filter(function (ad) {
        return ad.id !== lastId;
      })
    : ads;
  const value = typeof random === 'function' ? random() : Math.random();
  return choices[Math.min(choices.length - 1, Math.floor(value * choices.length))];
}

// Picks one ad for this language, different from the last one, and remembers it.
async function pickAd(lang) {
  const ads = filterAds(await loadAds(), lang, todayStr());
  let lastId = null;
  try {
    lastId = (await chrome.storage.local.get(ADS_LAST_KEY))[ADS_LAST_KEY] || null;
  } catch (error) {
    lastId = null;
  }
  const ad = chooseAd(ads, lastId);
  if (ad) {
    try {
      await chrome.storage.local.set({ [ADS_LAST_KEY]: ad.id });
    } catch (error) {
      // Not important: the next ad may just be the same one.
    }
  }
  return ad;
}

// Builds one card with h() only (never innerHTML).
// compact: one line for the popup. onRemoveAds: opens the Premium window.
function buildAdCard(ad, options) {
  const isPremiumAd = ad.url === PREMIUM_AD_URL;

  const cta = isPremiumAd
    ? h('button', { type: 'button', class: 'ad-cta', onclick: options.onRemoveAds }, ad.cta)
    : h('a', {
        class: 'ad-cta',
        href: safeHref(ad.url),
        target: '_blank',
        rel: 'noopener noreferrer sponsored'
      }, ad.cta);

  // The Premium ad already says "Go Premium", so it does not need a second link.
  const remove = isPremiumAd
    ? null
    : h('button', { type: 'button', class: 'ad-remove', onclick: options.onRemoveAds }, t('adRemoveAds'));

  const label = h('span', { class: 'ad-label', text: t('adSponsored') });

  if (options.compact) {
    // One line is short, so "Remove ads" is only the ⭐ icon here (the full text is the tooltip).
    const removeIcon = isPremiumAd
      ? null
      : h('button', {
          type: 'button',
          class: 'ad-remove',
          title: t('adRemoveAds'),
          'aria-label': t('adRemoveAds'),
          onclick: options.onRemoveAds
        }, '⭐');
    return h('aside', { class: 'ad-card ad-compact', 'aria-label': t('adSponsored') },
      label,
      h('span', { class: 'ad-title', dir: 'auto', title: ad.title, text: ad.title }),
      cta,
      removeIcon
    );
  }

  return h('aside', { class: 'ad-card', 'aria-label': t('adSponsored') },
    ad.image ? h('img', { class: 'ad-image', src: chrome.runtime.getURL(ad.image), alt: '', width: 40, height: 40 }) : null,
    h('div', { class: 'ad-body' },
      label,
      h('p', { class: 'ad-title', dir: 'auto', text: ad.title }),
      ad.text ? h('p', { class: 'ad-text', dir: 'auto', text: ad.text }) : null
    ),
    h('div', { class: 'ad-actions' }, cta, remove)
  );
}

function clearAd(container) {
  container.replaceChildren();
  container.hidden = true;
}

// Each call gets a number. If a newer call starts before an older one finishes,
// the older one does nothing, so two ads never fight for the same container.
let adRequestCount = 0;

// Shows one ad in the container, or nothing for Premium users.
async function renderAd(container, options) {
  const opts = options || {};
  const request = String(++adRequestCount);
  container.dataset.adRequest = request;

  const premium = await isPremium();
  const ad = premium ? null : await pickAd(I18n.lang);
  if (container.dataset.adRequest !== request) {
    return null;
  }
  if (!ad) {
    clearAd(container);
    return null;
  }
  container.replaceChildren(buildAdCard(ad, opts));
  container.hidden = false;
  return ad;
}

// Shows an ad now, and keeps it right when Premium changes:
// the ad disappears at once when the user gets Premium (no reload needed).
function showAds(container, options) {
  renderAd(container, options);
  onPremiumChange(function (premium) {
    if (premium) {
      container.dataset.adRequest = '';
      clearAd(container);
    } else {
      renderAd(container, options);
    }
  });
}
