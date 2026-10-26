// Simple tests for shared/core.js. Open tools/test-core.html in Chrome to run them.

'use strict';

// ---------------------------------------------------------------------------
// Fake chrome.storage.local
// ---------------------------------------------------------------------------
// When this page is opened as a normal file, chrome.storage does not exist.
// This small fake keeps the data in memory, so the Store tests can run.
if (!(window.chrome && chrome.storage && chrome.storage.local)) {
  const memory = {};
  window.chrome = window.chrome || {};
  chrome.storage = {
    local: {
      async get(key) {
        const result = {};
        if (key in memory) {
          result[key] = structuredClone(memory[key]);
        }
        return result;
      },
      async set(items) {
        Object.keys(items).forEach(function (key) {
          memory[key] = structuredClone(items[key]);
        });
      },
      async remove(key) {
        delete memory[key];
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Small test tools
// ---------------------------------------------------------------------------

const tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

// Stops the test with a clear message if actual is not the same as expected.
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      (message ? message + '\n' : '') +
      'expected: ' + JSON.stringify(expected) + '\n' +
      'actual:   ' + JSON.stringify(actual)
    );
  }
}

// A "YYYY-MM-DD" date some days before today.
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateStr(date);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('LinkedIn: /jobs/view/ID link', function () {
  assertEqual(
    normalizeJobUrl('https://www.linkedin.com/jobs/view/123456'),
    'https://www.linkedin.com/jobs/view/123456/'
  );
});

test('LinkedIn: title-ID link with tracking', function () {
  assertEqual(
    normalizeJobUrl('https://ae.linkedin.com/jobs/view/frontend-developer-at-acme-3901234567/?trk=public&refId=abc'),
    'https://www.linkedin.com/jobs/view/3901234567/'
  );
});

test('LinkedIn: currentJobId parameter', function () {
  assertEqual(
    normalizeJobUrl('https://www.linkedin.com/jobs/search/?currentJobId=3901234567&keywords=developer'),
    'https://www.linkedin.com/jobs/view/3901234567/'
  );
});

test('Indeed: jk and vjk, any country', function () {
  assertEqual(
    normalizeJobUrl('https://ae.indeed.com/viewjob?jk=a1b2c3d4e5&from=serp&tk=xyz'),
    'https://ae.indeed.com/viewjob?jk=a1b2c3d4e5'
  );
  assertEqual(
    normalizeJobUrl('https://www.indeed.co.uk/jobs?q=developer&vjk=f6e5d4c3b2'),
    'https://www.indeed.co.uk/viewjob?jk=f6e5d4c3b2'
  );
});

test('Other sites: tracking params, #hash and trailing slash removed', function () {
  assertEqual(
    normalizeJobUrl('https://jobs.example.com/careers/42/?utm_source=x&utm_medium=y&gclid=1&fbclid=2#apply'),
    'https://jobs.example.com/careers/42'
  );
  assertEqual(
    normalizeJobUrl('https://jobs.example.com/careers?id=42&gh_src=abc'),
    'https://jobs.example.com/careers?id=42',
    'normal parameters must stay'
  );
});

test('Not a link: returns the trimmed text', function () {
  assertEqual(normalizeJobUrl('   not a link  '), 'not a link');
  assertEqual(normalizeJobUrl(''), '');
});

test('safeHref blocks javascript: and allows https:', function () {
  assertEqual(safeHref('javascript:alert(1)'), null);
  assertEqual(safeHref('  JavaScript:alert(1)'), null);
  assertEqual(safeHref('data:text/html,hi'), null);
  assertEqual(safeHref('https://example.com/job'), 'https://example.com/job');
});

test('Dates: toDateStr and parseDateStr use local time', function () {
  assertEqual(toDateStr(new Date(2026, 0, 5)), '2026-01-05');
  const date = parseDateStr('2026-10-24');
  assertEqual(date.getFullYear() + '/' + date.getMonth() + '/' + date.getDate(), '2026/9/24');
  assertEqual(parseDateStr('2026-02-31'), null, 'a day that does not exist');
  assertEqual(parseDateStr('2026-10-24T09:30:00.000Z') instanceof Date, true, 'full ISO timestamp');
  assertEqual(parseDateStr('hello'), null);
});

test('Dates: formatDate and daysSince', function () {
  assertEqual(formatDate('2026-10-24'), 'Oct 24, 2026', 'English (default language)');
  assertEqual(formatDate(''), '—');
  assertEqual(daysSince(todayStr()), 0);
  assertEqual(daysSince(daysAgo(8)), 8);
  assertEqual(daysSince(''), null);
});

test('i18n: placeholders, plurals and English fallback', function () {
  const saved = { lang: I18n.lang, messages: I18n.messages, fallback: I18n.fallback };
  try {
    I18n.fallback = {
      hello: { message: 'Hello $NAME$, you have $$5', placeholders: { name: { content: '$1' } } },
      itemOne: { message: '1 item', placeholders: { count: { content: '$1' } } },
      itemOther: { message: '$COUNT$ items', placeholders: { count: { content: '$1' } } },
      onlyEnglish: { message: 'Only in English' },
      statusApplied: { message: 'Applied' }
    };
    I18n.messages = { statusApplied: { message: 'تم التقديم' } };
    I18n.lang = 'ar';

    assertEqual(t('hello', 'Omar'), 'Hello Omar, you have $5', 'placeholder and $$');
    assertEqual(tCount('item', 1), '1 item');
    assertEqual(tCount('item', 4), '4 items');
    assertEqual(t('onlyEnglish'), 'Only in English', 'missing key falls back to English');
    assertEqual(t('noSuchKey'), 'noSuchKey', 'unknown key returns the key');
    assertEqual(statusLabel('applied'), 'تم التقديم', 'status label is translated');
    assertEqual(I18n.locale(), 'ar');
    assertEqual(I18n.isRtl(), true);
    assertEqual(I18n.match('en-US'), 'en');
    assertEqual(I18n.match('ar-AE'), 'ar');
    assertEqual(I18n.match('xx'), null);
    assertEqual(I18n.match('tr-TR'), 'tr', 'Turkish browser');
    assertEqual(I18n.match('pt-BR'), 'pt_BR');
    assertEqual(I18n.match('pt-PT'), 'pt_BR', 'same language from another country');
    assertEqual(I18n.match('zh-TW'), 'zh_CN');
    assertEqual(I18n.match('en-GB'), 'en_GB');
    assertEqual(I18n.match('es-MX'), 'es');
  } finally {
    I18n.lang = saved.lang;
    I18n.messages = saved.messages;
    I18n.fallback = saved.fallback;
  }
});

test('cleanFields: trims, collapses, limits, rejects bad values', function () {
  const clean = cleanFields({
    title: '  Senior    Developer \n ',
    notes: '  Line one  \r\n\r\n\r\n\r\nLine   two ',
    company: 'x'.repeat(250),
    status: 'hacked',
    dateApplied: '2026-13-01'
  });
  assertEqual(clean.title, 'Senior Developer');
  assertEqual(clean.notes, 'Line one\n\nLine two', 'notes keep line breaks');
  assertEqual(clean.company.length, 200);
  assertEqual('status' in clean, false, 'bad status is ignored');
  assertEqual('dateApplied' in clean, false, 'bad date is ignored');
});

test('createJob: defaults, and "applied" sets dateApplied', function () {
  const job = createJob({ title: 'Designer', company: 'شركة' });
  assertEqual(job.status, 'saved');
  assertEqual(job.dateSaved, todayStr());
  assertEqual(job.dateApplied, '');
  assertEqual(job.company, 'شركة', 'Arabic text is kept');
  assertEqual(typeof job.id, 'string');

  const applied = createJob({ title: 'Designer', status: 'applied' });
  assertEqual(applied.dateApplied, todayStr());
});

test('updateJob: returns a new object and tracks status change', function () {
  const oldJob = Object.assign(createJob({ title: 'Old title' }), {
    statusChangedAt: '2020-01-01T00:00:00.000Z'
  });
  const newJob = updateJob(oldJob, { title: 'New title', status: 'applied' });

  assertEqual(oldJob.title, 'Old title', 'old job must not change');
  assertEqual(newJob.title, 'New title');
  assertEqual(newJob.id, oldJob.id);
  assertEqual(newJob.status, 'applied');
  assertEqual(newJob.dateApplied, todayStr());
  assertEqual(newJob.statusChangedAt !== oldJob.statusChangedAt, true, 'statusChangedAt must change');

  const sameStatus = updateJob(newJob, { notes: 'hi' });
  assertEqual(sameStatus.statusChangedAt, newJob.statusChangedAt, 'same status keeps statusChangedAt');
});

test('followUpDue: applied 8 days ago → true', function () {
  const oldApplied = createJob({ title: 'A', status: 'applied', dateApplied: daysAgo(8) });
  const newApplied = createJob({ title: 'B', status: 'applied', dateApplied: daysAgo(3) });
  const interview = createJob({ title: 'C', status: 'interview', dateApplied: daysAgo(8) });

  assertEqual(followUpDays(oldApplied), 8);
  assertEqual(followUpDue(oldApplied), true);
  assertEqual(followUpDue(newApplied), false, '3 days is too early');
  assertEqual(followUpDue(interview), false, 'only "applied" jobs need a follow up');
});

test('Store: add, update and remove', async function () {
  await Store.saveAll([]);
  const job = createJob({ title: 'Store test' });

  await Store.upsert(job);
  assertEqual((await Store.all()).length, 1, 'after add');

  await Store.upsert(updateJob(job, { status: 'interview' }));
  const jobs = await Store.all();
  assertEqual(jobs.length, 1, 'update must replace, not add');
  assertEqual(jobs[0].status, 'interview');

  await Store.remove(job.id);
  assertEqual((await Store.all()).length, 0, 'after remove');
});

test('Store.findByUrl: finds the same job from a different link', async function () {
  await Store.saveAll([]);
  const job = createJob({ title: 'Find me', url: 'https://www.linkedin.com/jobs/view/3901234567/' });
  await Store.upsert(job);
  const jobs = await Store.all();

  const found = Store.findByUrl(jobs, 'https://www.linkedin.com/jobs/search/?currentJobId=3901234567');
  assertEqual(found && found.id, job.id);
  assertEqual(Store.findByUrl(jobs, 'https://www.linkedin.com/jobs/view/111/'), null, 'other job');
  assertEqual(Store.findByUrl(jobs, ''), null, 'empty url never matches');
});

test('h(): "<b>hi</b>" is plain text, not bold', function () {
  const el = h('p', { text: '<b>hi</b>' });
  assertEqual(el.textContent, '<b>hi</b>');
  assertEqual(el.querySelector('b'), null, 'no <b> element must be created');

  const child = h('div', null, '<i>x</i>', null, false);
  assertEqual(child.textContent, '<i>x</i>');
  assertEqual(child.children.length, 0);
});

test('h(): attributes, true/false values, dataset and events', function () {
  let clicks = 0;
  const option = h('option', { value: 'applied', selected: true, disabled: false });
  const button = h('button', { class: 'btn', dataset: { id: '42' }, onclick: function () { clicks++; } });
  button.click();

  assertEqual(option.getAttribute('selected'), '');
  assertEqual(option.hasAttribute('disabled'), false);
  assertEqual(button.className, 'btn');
  assertEqual(button.dataset.id, '42');
  assertEqual(clicks, 1);

  const unsafe = h('a', { onclick: 'alert(1)', onmouseover: 'alert(2)' });
  assertEqual(unsafe.hasAttribute('onclick') || unsafe.hasAttribute('onmouseover'), false, 'text event handlers are never added');
});

// ---------------------------------------------------------------------------
// Premium (with a fake Dodo server, so no internet is needed)
// ---------------------------------------------------------------------------

// The fake Dodo license server. fakeDodo.keys maps a key to 'active', 'disabled' or 'full'.
const fakeDodo = { keys: {}, networkDown: false, validateCalls: 0 };

window.fetch = async function (url, options) {
  if (fakeDodo.networkDown) {
    throw new TypeError('Failed to fetch');
  }
  const body = JSON.parse(options.body);
  const state = fakeDodo.keys[body.license_key];
  const reply = function (status, data) {
    return new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json' } });
  };
  if (url.endsWith('/licenses/activate')) {
    if (!state) return reply(404, { code: 'NOT_FOUND' });
    if (state === 'disabled') return reply(403, { code: 'INACTIVE' });
    if (state === 'full') return reply(422, { code: 'LIMIT' });
    return reply(200, { id: 'lki_test_1', name: body.name });
  }
  if (url.endsWith('/licenses/validate')) {
    fakeDodo.validateCalls++;
    return reply(200, { valid: state === 'active' });
  }
  if (url.endsWith('/licenses/deactivate')) {
    return reply(200, {});
  }
  return reply(404, {});
};

async function resetLicense() {
  await chrome.storage.local.set({ license: null });
  fakeDodo.keys = {};
  fakeDodo.networkDown = false;
  fakeDodo.validateCalls = 0;
}

// Runs fn and returns the error code it throws (or 'no error').
async function errorCode(fn) {
  try {
    await fn();
    return 'no error';
  } catch (error) {
    return error.code;
  }
}

test('Premium: free by default, premium after activating a key', async function () {
  await resetLicense();
  assertEqual(await isPremium(), false, 'no license saved yet');

  fakeDodo.keys['GOOD-KEY-1234'] = 'active';
  const license = await activateLicense('  GOOD-KEY-1234  ');
  assertEqual(license.premium, true);
  assertEqual(license.licenseKey, 'GOOD-KEY-1234', 'spaces are removed');
  assertEqual(license.instanceId, 'lki_test_1');
  assertEqual(await isPremium(), true);
  assertEqual(maskLicenseKey(license.licenseKey), '•••• 1234', 'only the end of the key is shown');
});

test('Premium: wrong, disabled, full and empty keys give clear errors', async function () {
  await resetLicense();
  fakeDodo.keys['OLD-KEY'] = 'disabled';
  fakeDodo.keys['FULL-KEY'] = 'full';
  assertEqual(await errorCode(() => activateLicense('NO-SUCH-KEY')), 'not_found');
  assertEqual(await errorCode(() => activateLicense('OLD-KEY')), 'inactive');
  assertEqual(await errorCode(() => activateLicense('FULL-KEY')), 'limit');
  assertEqual(await errorCode(() => activateLicense('   ')), 'empty');
  fakeDodo.networkDown = true;
  assertEqual(await errorCode(() => activateLicense('ANY-KEY')), 'network');
  assertEqual(await isPremium(), false, 'a failed activation never gives Premium');
});

test('Premium: no internet keeps the saved Premium', async function () {
  await resetLicense();
  fakeDodo.keys['GOOD-KEY'] = 'active';
  await activateLicense('GOOD-KEY');

  fakeDodo.networkDown = true;
  await refreshLicense({ force: true });
  assertEqual(await isPremium(), true, 'a network error must never remove Premium');
});

test('Premium: checks online at most every 12 hours', async function () {
  await resetLicense();
  fakeDodo.keys['GOOD-KEY'] = 'active';
  await activateLicense('GOOD-KEY');

  await refreshLicense();
  assertEqual(fakeDodo.validateCalls, 0, 'a fresh license is not checked again');

  const saved = (await chrome.storage.local.get('license')).license;
  saved.checkedAt = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  await chrome.storage.local.set({ license: saved });
  await refreshLicense();
  assertEqual(fakeDodo.validateCalls, 1, 'a license older than 12 hours is checked again');
});

test('Premium: an ended subscription removes Premium, removing the key frees it', async function () {
  await resetLicense();
  fakeDodo.keys['GOOD-KEY'] = 'active';
  await activateLicense('GOOD-KEY');

  fakeDodo.keys['GOOD-KEY'] = 'disabled';
  const license = await refreshLicense({ force: true });
  assertEqual(license.premium, false, 'Dodo disabled the key');

  await removeLicense();
  assertEqual(await isPremium(), false);
  assertEqual((await chrome.storage.local.get('license')).license, undefined, 'license removed');
  await resetLicense();
});

// ---------------------------------------------------------------------------
// Sponsored cards
// ---------------------------------------------------------------------------

test('Ads: unsafe or broken ads are rejected', function () {
  const good = { id: 'a', title: 'Title', cta: 'Go', url: 'https://example.com' };
  assertEqual(isValidAd(good), true);
  assertEqual(isValidAd(Object.assign({}, good, { url: '#premium' })), true, 'house ad');
  assertEqual(isValidAd(Object.assign({}, good, { url: 'javascript:alert(1)' })), false, 'javascript: link');
  assertEqual(isValidAd(Object.assign({}, good, { image: 'https://evil.com/ad.png' })), false, 'image from the internet');
  assertEqual(isValidAd(Object.assign({}, good, { image: 'icons/ads/../../x.png' })), false, 'image outside icons/ads');
  assertEqual(isValidAd(Object.assign({}, good, { image: 'icons/ads/star.svg' })), true, 'local image');
  assertEqual(isValidAd(Object.assign({}, good, { title: '  ' })), false, 'empty title');
  assertEqual(isValidAd(Object.assign({}, good, { endDate: '2026-02-31' })), false, 'wrong date');
});

test('Ads: language and end date filters', function () {
  const ads = [
    { id: 'all', title: 't', cta: 'c', url: 'https://example.com' },
    { id: 'ar', title: 't', cta: 'c', url: 'https://example.com', languages: ['ar'] },
    { id: 'en', title: 't', cta: 'c', url: 'https://example.com', languages: ['en'] },
    { id: 'old', title: 't', cta: 'c', url: 'https://example.com', endDate: '2026-01-01' },
    { id: 'today', title: 't', cta: 'c', url: 'https://example.com', endDate: '2026-10-25' }
  ];
  const ids = function (list) {
    return list.map(function (ad) {
      return ad.id;
    }).join(',');
  };
  assertEqual(ids(filterAds(ads, 'ar', '2026-10-25')), 'all,ar,today', 'Arabic, and the last day still counts');
  assertEqual(ids(filterAds(ads, 'en_GB', '2026-10-25')), 'all,en,today', '"en" also matches en_GB');
  assertEqual(ids(filterAds(ads, 'en', '2026-10-26')), 'all,en', 'ended ads are removed');
});

test('Ads: never the same ad twice in a row', function () {
  const ads = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  for (let i = 0; i < 10; i++) {
    const value = i / 10;
    assertEqual(chooseAd(ads, 'b', function () { return value; }).id !== 'b', true, 'random value ' + value);
  }
  assertEqual(chooseAd([{ id: 'only' }], 'only').id, 'only', 'a single ad can repeat');
  assertEqual(chooseAd([], null), null, 'no ads');
});

// ---------------------------------------------------------------------------
// Run all tests and show the results
// ---------------------------------------------------------------------------

async function runTests() {
  const list = document.getElementById('results');
  let passed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      list.appendChild(h('li', { class: 'pass' }, 'PASS  ' + t.name));
    } catch (error) {
      list.appendChild(
        h('li', { class: 'fail' }, 'FAIL  ' + t.name, h('span', { class: 'error', text: error.message }))
      );
    }
  }

  const summary = document.getElementById('summary');
  summary.textContent = passed + ' / ' + tests.length + ' tests passed';
  summary.className = passed === tests.length ? 'pass' : 'fail';
}

runTests();
