// Tests for shared/extractor.js. Open tools/test-extractor.html in Chrome to run them.
// Each test makes a fake page with DOMParser and checks what extractJobInfo() reads from it.

'use strict';

// Makes a fake page (a separate document) from HTML text. Nothing in it runs.
function fakePage(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// Makes a <script type="application/ld+json"> tag from a JavaScript object.
function jsonLd(data) {
  return '<script type="application/ld+json">' + JSON.stringify(data) + '</script>';
}

const cases = [
  {
    name: 'LinkedIn page',
    url: 'https://www.linkedin.com/jobs/view/3901234567/',
    html:
      '<title>(3) Frontend Developer | Acme | LinkedIn</title>' +
      '<div class="job-details-jobs-unified-top-card__job-title"><h1> Frontend   Developer </h1></div>' +
      '<div class="job-details-jobs-unified-top-card__company-name"><a href="#">Acme</a></div>' +
      '<div class="job-details-jobs-unified-top-card__primary-description-container">' +
      '<span class="tvm__text">Dubai, United Arab Emirates · 2 weeks ago · 100 applicants</span></div>',
    expected: {
      title: 'Frontend Developer',
      company: 'Acme',
      location: 'Dubai, United Arab Emirates',
      method: 'linkedin'
    }
  },
  {
    name: 'LinkedIn page: missing company is filled from JSON-LD',
    url: 'https://ae.linkedin.com/jobs/view/frontend-developer-3901234567',
    html:
      '<h1 class="top-card-layout__title">Frontend Developer</h1>' +
      jsonLd({ '@type': 'JobPosting', title: 'Other title', hiringOrganization: { name: 'Acme' } }),
    expected: { title: 'Frontend Developer', company: 'Acme', location: '', method: 'linkedin' }
  },
  {
    name: 'Indeed page with " - job post"',
    url: 'https://ae.indeed.com/viewjob?jk=a1b2c3d4e5',
    html:
      '<h1 data-testid="jobsearch-JobInfoHeader-title">Data Analyst<span> - job post</span></h1>' +
      '<div data-testid="inlineHeader-companyName"><a href="#">Gulf Data LLC</a></div>' +
      '<div data-testid="inlineHeader-companyLocation">Abu Dhabi</div>',
    expected: { title: 'Data Analyst', company: 'Gulf Data LLC', location: 'Abu Dhabi', method: 'indeed' }
  },
  {
    name: 'Company site: JSON-LD in @graph, Arabic title',
    url: 'https://careers.alnoor.example/jobs/17',
    html:
      '<title>Careers</title>' +
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Careers' },
          {
            '@type': 'JobPosting',
            title: 'مهندس برمجيات',
            hiringOrganization: { '@type': 'Organization', name: 'شركة النور' },
            jobLocation: {
              '@type': 'Place',
              address: { addressLocality: 'Dubai', addressRegion: 'Dubai', addressCountry: 'AE' }
            }
          }
        ]
      }),
    expected: { title: 'مهندس برمجيات', company: 'شركة النور', location: 'Dubai, Dubai, AE', method: 'jsonld' }
  },
  {
    name: 'JSON-LD: many locations (no duplicates, max 3)',
    url: 'https://jobs.example.com/42',
    html: jsonLd([
      { '@type': 'Organization', name: 'Example' },
      {
        '@type': ['JobPosting'],
        name: 'Support Agent',
        hiringOrganization: ['Example Inc'],
        jobLocation: [
          { address: { addressLocality: 'Cairo', addressCountry: { name: 'Egypt' } } },
          { address: { addressLocality: 'Cairo', addressCountry: { name: 'Egypt' } } },
          { address: 'Amman, Jordan' },
          { address: { addressLocality: 'Riyadh' } },
          { address: { addressLocality: 'Doha' } }
        ]
      }
    ]),
    expected: {
      title: 'Support Agent',
      company: 'Example Inc',
      location: 'Cairo, Egypt / Amman, Jordan / Riyadh',
      method: 'jsonld'
    }
  },
  {
    name: 'JSON-LD: remote job',
    url: 'https://remote.example.com/jobs/7',
    html: jsonLd({
      '@type': 'JobPosting',
      title: 'Backend Engineer',
      hiringOrganization: 'Remote First Co',
      jobLocationType: 'TELECOMMUTE',
      jobLocation: { address: { addressLocality: 'Berlin', addressCountry: { name: 'Germany' } } }
    }),
    expected: {
      title: 'Backend Engineer',
      company: 'Remote First Co',
      location: 'Remote (Berlin, Germany)',
      method: 'jsonld'
    }
  },
  {
    name: 'JSON-LD: &amp; in names is decoded',
    url: 'https://smith.example.com/jobs/1',
    html:
      '<meta property="og:site_name" content="Smith Careers">' +
      jsonLd({
        '@type': 'JobPosting',
        title: 'Sales &amp; Marketing Lead',
        hiringOrganization: { name: 'Smith &amp; Sons' },
        jobLocationType: ['TELECOMMUTE']
      }),
    expected: {
      title: 'Sales & Marketing Lead',
      company: 'Smith & Sons',
      location: 'Remote',
      method: 'jsonld'
    }
  },
  {
    name: 'Broken JSON does not crash',
    url: 'https://broken.example.com/job',
    html:
      '<title>Backup Title</title>' +
      '<script type="application/ld+json">{ "@type": "JobPosting", "title": </script>',
    expected: { title: 'Backup Title', company: '', location: '', method: 'title' }
  },
  {
    name: 'Page with only a <title>',
    url: 'https://example.com/careers/designer',
    html: '<title>  Junior Designer –  Example Co </title><p>Hello</p>',
    expected: { title: 'Junior Designer – Example Co', company: '', location: '', method: 'title' }
  },
  {
    name: 'og:title and og:site_name are used before <title>',
    url: 'https://jobs.example.org/99',
    html:
      '<title>Jobs</title>' +
      '<meta property="og:title" content="QA Tester">' +
      '<meta property="og:site_name" content="Example Org">',
    expected: { title: 'QA Tester', company: 'Example Org', location: '', method: 'title' }
  },
  {
    name: 'Empty page → method "none"',
    url: 'https://empty.example.com/',
    html: '',
    expected: { title: '', company: '', location: '', method: 'none' }
  },
  {
    name: 'Bad input (no document) never throws',
    url: 'not a url',
    doc: null,
    expected: { title: '', company: '', location: '', url: 'not a url', method: 'none' }
  }
];

// Runs one case. Returns the list of fields that are wrong (empty list = PASS).
function runCase(testCase) {
  const doc = 'doc' in testCase ? testCase.doc : fakePage(testCase.html);
  const result = extractJobInfo(doc, testCase.url);
  const expected = Object.assign({ url: testCase.url }, testCase.expected);

  const problems = Object.keys(expected)
    .filter(function (key) {
      return result[key] !== expected[key];
    })
    .map(function (key) {
      return key + ': expected ' + JSON.stringify(expected[key]) + ', got ' + JSON.stringify(result[key]);
    });

  return { result: result, problems: problems };
}

function showResults() {
  const list = document.getElementById('results');
  let passed = 0;

  cases.forEach(function (testCase) {
    let outcome;
    try {
      outcome = runCase(testCase);
    } catch (error) {
      outcome = { result: null, problems: ['crashed: ' + error.message] };
    }

    const ok = outcome.problems.length === 0;
    if (ok) {
      passed++;
    }

    const item = document.createElement('li');
    item.className = ok ? 'pass' : 'fail';
    item.textContent = (ok ? 'PASS  ' : 'FAIL  ') + testCase.name;

    const details = document.createElement('pre');
    details.textContent =
      JSON.stringify(outcome.result, null, 2) + (ok ? '' : '\n\n' + outcome.problems.join('\n'));
    item.appendChild(details);

    list.appendChild(item);
  });

  const summary = document.getElementById('summary');
  summary.textContent = passed + ' / ' + cases.length + ' tests passed';
  summary.className = passed === cases.length ? 'pass' : 'fail';
}

showResults();
