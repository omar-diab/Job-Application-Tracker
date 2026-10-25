// Checks all translation files in _locales. Run it with:
//   node tools/check-locales.js
//
// For every _locales/LANG/messages.json it checks:
// - the file is valid JSON,
// - it has the same keys as English (nothing missing, nothing extra),
// - every message uses the same $PLACEHOLDERS$ as English,
// - extName is max 75 characters and extDescription is under 132 characters.
// It also checks that every language in shared/i18n.js has a folder, and the other way around.
// Exit code 1 if there is a problem, so GitHub Actions can fail.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, '_locales');
const MAX_NAME = 75;
const MAX_DESCRIPTION = 131;

const problems = [];

function problem(lang, message) {
  problems.push(lang + ': ' + message);
}

// Reads a messages.json file. Returns null (and reports a problem) if it is broken.
function readMessages(lang) {
  const file = path.join(LOCALES_DIR, lang, 'messages.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problem(lang, 'cannot read messages.json (' + error.message + ')');
    return null;
  }
}

// The $NAME$ placeholders used in a message, as a sorted list in lower case.
function placeholdersIn(message) {
  const names = (String(message).match(/\$[A-Za-z0-9_@]+\$/g) || []).map(function (name) {
    return name.toLowerCase();
  });
  return Array.from(new Set(names)).sort();
}

// Counts characters like people see them (an emoji or Arabic letter is 1).
function length(text) {
  return Array.from(String(text)).length;
}

// The language codes listed in shared/i18n.js.
function languagesInCode() {
  const source = fs.readFileSync(path.join(ROOT, 'shared', 'i18n.js'), 'utf8');
  const list = source.match(/const LANGUAGES = [\s\S]*?\]\);/);
  if (!list) {
    problem('shared/i18n.js', 'cannot find the LANGUAGES list');
    return [];
  }
  return Array.from(list[0].matchAll(/code: '([A-Za-z_]+)'/g)).map(function (match) {
    return match[1];
  });
}

const english = readMessages('en');
if (!english) {
  console.error('English messages are missing or broken. Nothing else can be checked.');
  process.exit(1);
}
const englishKeys = Object.keys(english);

const folders = fs.readdirSync(LOCALES_DIR).filter(function (name) {
  return fs.statSync(path.join(LOCALES_DIR, name)).isDirectory();
}).sort();

folders.forEach(function (lang) {
  const messages = readMessages(lang);
  if (!messages) {
    return;
  }

  englishKeys.forEach(function (key) {
    const entry = messages[key];
    if (!entry || typeof entry.message !== 'string') {
      problem(lang, 'missing "' + key + '"');
      return;
    }
    if (!entry.message.trim()) {
      problem(lang, '"' + key + '" is empty');
    }

    const expected = placeholdersIn(english[key].message).join(', ');
    const actual = placeholdersIn(entry.message).join(', ');
    if (expected !== actual) {
      problem(lang, '"' + key + '" placeholders should be [' + expected + '] but are [' + actual + ']');
    }

    const expectedDefs = JSON.stringify(english[key].placeholders || {});
    const actualDefs = JSON.stringify(entry.placeholders || {});
    if (expectedDefs !== actualDefs) {
      problem(lang, '"' + key + '" has a different "placeholders" object than English');
    }
  });

  Object.keys(messages).forEach(function (key) {
    if (!english[key]) {
      problem(lang, 'extra key "' + key + '" (not in English)');
    }
  });

  if (messages.extName && length(messages.extName.message) > MAX_NAME) {
    problem(lang, 'extName is ' + length(messages.extName.message) + ' characters (max ' + MAX_NAME + ')');
  }
  if (messages.extDescription && length(messages.extDescription.message) > MAX_DESCRIPTION) {
    problem(lang, 'extDescription is ' + length(messages.extDescription.message) +
      ' characters (must be under 132)');
  }
});

// Every language in the picker needs a folder, and every folder should be in the picker.
const inCode = languagesInCode();
inCode.forEach(function (lang) {
  if (!folders.includes(lang)) {
    problem(lang, 'listed in shared/i18n.js but _locales/' + lang + ' does not exist');
  }
});
folders.forEach(function (lang) {
  if (!inCode.includes(lang)) {
    problem(lang, '_locales/' + lang + ' exists but is not listed in LANGUAGES in shared/i18n.js');
  }
});

if (problems.length) {
  console.error('Found ' + problems.length + ' problem(s):\n');
  problems.forEach(function (text) {
    console.error('  ✗ ' + text);
  });
  process.exit(1);
}

console.log('All ' + folders.length + ' languages are OK (' + englishKeys.length + ' messages each): ' +
  folders.join(', '));
