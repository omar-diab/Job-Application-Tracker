// Checks shared/ads.json. Run it with:
//   node tools/check-ads.js
//
// For every ad it checks:
// - id, title (or titleKey) and cta (or ctaKey) are there, and every id is different,
// - "sponsored" (optional) is true or false (false = our own card, labeled "From the developer"),
// - url is "#premium" or a normal http:// or https:// link,
// - image (optional) is a file in icons/ads/ that really exists,
// - endDate (optional) is a real date written as YYYY-MM-DD,
// - languages (optional) are languages that exist in _locales.
// It also warns about ads that have already ended.
// Exit code 1 if there is a problem, so GitHub Actions can fail.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ADS_FILE = path.join(ROOT, 'shared', 'ads.json');
const IMAGE_PATTERN = /^icons\/ads\/[a-z0-9_-]+\.(png|jpg|jpeg|webp|svg)$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const problems = [];
const warnings = [];

// Today as YYYY-MM-DD (local time), like todayStr() in shared/core.js.
function today() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function isRealDate(text) {
  if (!DATE_PATTERN.test(text)) {
    return false;
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isWebLink(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

let ads;
try {
  ads = JSON.parse(fs.readFileSync(ADS_FILE, 'utf8'));
} catch (error) {
  console.error('shared/ads.json is not valid JSON: ' + error.message);
  process.exit(1);
}
if (!Array.isArray(ads)) {
  console.error('shared/ads.json must be a list: [ { ... }, { ... } ]');
  process.exit(1);
}

const languages = fs.readdirSync(path.join(ROOT, '_locales'));
const englishMessages = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', 'en', 'messages.json'), 'utf8'));
const ids = new Set();

ads.forEach(function (ad, index) {
  const name = 'ad #' + (index + 1) + (ad && ad.id ? ' ("' + ad.id + '")' : '');
  if (!ad || typeof ad !== 'object') {
    problems.push(name + ': must be an object { ... }');
    return;
  }

  if (typeof ad.id !== 'string' || !ad.id.trim()) {
    problems.push(name + ': "id" is missing');
  }
  // Each text is fixed ("title") or a translation key ("titleKey") from _locales/en/messages.json.
  ['title', 'cta', 'text'].forEach(function (field) {
    const key = ad[field + 'Key'];
    if (key !== undefined) {
      if (typeof key !== 'string' || !englishMessages[key]) {
        problems.push(name + ': "' + field + 'Key" must be a key from _locales/en/messages.json');
      }
    } else if (field !== 'text' && (typeof ad[field] !== 'string' || !ad[field].trim())) {
      problems.push(name + ': "' + field + '" (or "' + field + 'Key") is missing');
    } else if (field === 'text' && ad.text !== undefined && typeof ad.text !== 'string') {
      problems.push(name + ': "text" must be text');
    }
  });
  if (ad.sponsored !== undefined && typeof ad.sponsored !== 'boolean') {
    problems.push(name + ': "sponsored" must be true or false');
  }

  if (ids.has(ad.id)) {
    problems.push(name + ': the id is used twice');
  }
  ids.add(ad.id);

  if (ad.url !== '#premium' && !isWebLink(ad.url)) {
    problems.push(name + ': "url" must be "#premium" or start with http:// or https://');
  }

  if (ad.image !== undefined) {
    if (!IMAGE_PATTERN.test(ad.image)) {
      problems.push(name + ': "image" must be a file in icons/ads/ (png, jpg, webp or svg), like "icons/ads/my-ad.png"');
    } else if (!fs.existsSync(path.join(ROOT, ad.image))) {
      problems.push(name + ': the image file ' + ad.image + ' does not exist');
    }
  }

  if (ad.endDate !== undefined) {
    if (typeof ad.endDate !== 'string' || !isRealDate(ad.endDate)) {
      problems.push(name + ': "endDate" must be a real date like "2027-12-31"');
    } else if (ad.endDate < today()) {
      warnings.push(name + ': ended on ' + ad.endDate + ', so it is not shown anymore. You can remove it.');
    }
  }

  if (ad.languages !== undefined) {
    if (!Array.isArray(ad.languages) || !ad.languages.length) {
      problems.push(name + ': "languages" must be a list like ["ar"], or be removed (= all languages)');
    } else {
      ad.languages.forEach(function (lang) {
        if (!languages.includes(lang)) {
          problems.push(name + ': language "' + lang + '" does not exist in _locales');
        }
      });
    }
  }
});

warnings.forEach(function (text) {
  console.warn('  ! ' + text);
});

if (problems.length) {
  console.error('Found ' + problems.length + ' problem(s) in shared/ads.json:\n');
  problems.forEach(function (text) {
    console.error('  ✗ ' + text);
  });
  process.exit(1);
}

console.log('shared/ads.json is OK (' + ads.length + ' ads).');
