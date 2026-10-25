// Translations for the popup and the dashboard.
//
// Chrome has chrome.i18n.getMessage(), but it always uses the browser language,
// and the user cannot change it. So we load _locales/LANG/messages.json ourselves.
// The files use the normal Chrome format, so chrome.i18n still works for manifest.json.
//
// Load this file BEFORE core.js. Then:
//   await I18n.init();               // once, when the page starts
//   t('saveJob')                     // → "Save job"
//   t('noticeAlreadySaved', date)    // → "Already saved on 24 Oct 2026"
//   tCount('jobCount', 5)            // → "5 jobs"
//   <button data-i18n="saveJob">     // filled by I18n.apply()

'use strict';

// Languages the user can choose, each in its own name.
const LANGUAGES = Object.freeze([
  Object.freeze({ code: 'en', name: 'English' }),
  Object.freeze({ code: 'ar', name: 'العربية' })
]);

// Languages written from right to left.
const RTL_LANGUAGES = Object.freeze(['ar', 'fa', 'he']);

const DEFAULT_LANGUAGE = 'en';

// The key in chrome.storage.local where the chosen language is saved.
const LANGUAGE_SETTING_KEY = 'settings.language';

// Browser language codes that have a different name in _locales.
const LANGUAGE_ALIASES = Object.freeze({
  nb: 'no',
  nn: 'no',
  iw: 'he',
  tl: 'fil',
  zh: 'zh_CN',
  zh_SG: 'zh_CN',
  zh_HK: 'zh_TW',
  zh_MO: 'zh_TW',
  pt: 'pt_PT'
});

const I18n = {
  lang: DEFAULT_LANGUAGE,
  messages: {},   // the chosen language
  fallback: {},   // English, used when a key is missing in the chosen language

  // True if we have a messages.json for this language code.
  isSupported(code) {
    return LANGUAGES.some(function (language) {
      return language.code === code;
    });
  },

  // Finds the best language for a browser language like "ar", "en-US" or "pt-BR".
  match(tag) {
    if (typeof tag !== 'string' || !tag) {
      return null;
    }
    const code = tag.replace(/-/g, '_');
    const base = code.split('_')[0].toLowerCase();
    const candidates = [code, LANGUAGE_ALIASES[code], LANGUAGE_ALIASES[base], base];
    if (base === 'es') {
      // Spanish outside Spain uses Latin American Spanish.
      candidates.splice(1, 0, code.toLowerCase() === 'es_es' ? 'es' : 'es_419');
    }
    for (const candidate of candidates) {
      if (candidate && I18n.isSupported(candidate)) {
        return candidate;
      }
    }
    return null;
  },

  // The browser language, if we support it.
  browserLanguage() {
    const tag = chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
    return I18n.match(tag) || DEFAULT_LANGUAGE;
  },

  // Loads _locales/CODE/messages.json. Returns {} if it cannot be loaded.
  async loadMessages(code) {
    try {
      const response = await fetch(chrome.runtime.getURL('_locales/' + code + '/messages.json'));
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return await response.json();
    } catch (error) {
      console.warn('Could not load the "' + code + '" translations:', error);
      return {};
    }
  },

  // Starts the translations: English as fallback, then the saved or browser language.
  async init() {
    I18n.fallback = await I18n.loadMessages(DEFAULT_LANGUAGE);
    let saved = null;
    try {
      const result = await chrome.storage.local.get(LANGUAGE_SETTING_KEY);
      saved = result[LANGUAGE_SETTING_KEY];
    } catch (error) {
      console.warn('Could not read the language setting:', error);
    }
    await I18n.use(I18n.isSupported(saved) ? saved : I18n.browserLanguage());
  },

  // Switches to a language on this page (without saving the choice).
  async use(code) {
    const lang = I18n.isSupported(code) ? code : DEFAULT_LANGUAGE;
    I18n.messages = lang === DEFAULT_LANGUAGE ? I18n.fallback : await I18n.loadMessages(lang);
    I18n.lang = lang;
    I18n.apply(document);
  },

  // Switches to a language and saves the choice for the popup and other tabs.
  async setLanguage(code) {
    await I18n.use(code);
    await chrome.storage.local.set({ [LANGUAGE_SETTING_KEY]: I18n.lang });
  },

  // The language as a BCP 47 tag for Intl, like "pt-BR".
  locale() {
    return I18n.lang.replace(/_/g, '-');
  },

  isRtl() {
    return RTL_LANGUAGES.includes(I18n.lang.split('_')[0]);
  },

  // True if this key has a translation (in the chosen language or in English).
  has(key) {
    return Boolean(I18n.messages[key] || I18n.fallback[key]);
  },

  // Fills the page texts from data-i18n attributes, and sets lang and dir on <html>.
  // Always with textContent or setAttribute, never innerHTML.
  apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.dataset.i18nTitle));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    document.documentElement.lang = I18n.locale();
    document.documentElement.dir = I18n.isRtl() ? 'rtl' : 'ltr';
  }
};

// Puts the values into a message. Chrome's format:
//   "message": "Already saved on $DATE$",
//   "placeholders": { "date": { "content": "$1" } }
// $DATE$ → placeholder "date" → "$1" → the first value. "$$" is a real "$".
function formatMessage(entry, values) {
  const placeholders = entry.placeholders || {};
  return String(entry.message).replace(/\$([A-Za-z0-9_@]+)\$|\$\$/g, function (match, name) {
    if (!name) {
      return '$';
    }
    const placeholder = placeholders[name.toLowerCase()];
    if (!placeholder) {
      return match;
    }
    return String(placeholder.content).replace(/\$(\d)/g, function (whole, number) {
      const value = values[Number(number) - 1];
      return value === undefined || value === null ? '' : String(value);
    });
  });
}

// Returns the translated text for a key. Falls back to English, then to the key itself.
// substitutions can be one value or an array of values.
function t(key, substitutions) {
  const entry = I18n.messages[key] || I18n.fallback[key];
  if (!entry || typeof entry.message !== 'string') {
    return key;
  }
  let values = [];
  if (Array.isArray(substitutions)) {
    values = substitutions;
  } else if (substitutions !== undefined) {
    values = [substitutions];
  }
  return formatMessage(entry, values);
}

// Simple plural forms: KEY + "One" for 1, KEY + "Other" for all other numbers.
// The count is always the first value ($1). More values can follow.
//   tCount('jobCount', 5) → t('jobCountOther', [5]) → "5 jobs"
function tCount(baseKey, count, moreValues) {
  const key = baseKey + (count === 1 ? 'One' : 'Other');
  return t(key, [count].concat(moreValues || []));
}
