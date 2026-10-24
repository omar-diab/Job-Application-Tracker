// Reads the job title, company and location from a job page.
//
// IMPORTANT: the popup runs this function INSIDE the job page with
//   chrome.scripting.executeScript({ func: extractJobInfo })
// Chrome copies only the code of this one function into the page.
// So everything it needs must be inside it: no core.js, no outside variables or helpers.

'use strict';

function extractJobInfo(doc = document, pageUrl = location.href) {
  const MAX_LENGTH = 300;

  const result = { title: '', company: '', location: '', url: '', method: 'none' };

  // Collapses spaces and line breaks into one space, and trims.
  function clean(text) {
    if (text === null || text === undefined) {
      return '';
    }
    return String(text).replace(/\s+/g, ' ').trim();
  }

  // Turns HTML entities into normal text: "Smith &amp; Sons" → "Smith & Sons".
  // DOMParser makes a separate, inactive document: nothing in it can run.
  function decode(text) {
    const value = clean(text);
    if (!/[&<]/.test(value)) {
      return value;
    }
    try {
      const parsed = new DOMParser().parseFromString(value, 'text/html');
      return clean(parsed.documentElement.textContent);
    } catch (error) {
      return value;
    }
  }

  // Returns the text of the first element (from the selectors, in order) that has text.
  function firstText(selectors) {
    for (const selector of selectors) {
      try {
        const elements = doc.querySelectorAll(selector);
        for (const el of elements) {
          // innerText gives the text as you see it. If it is missing, use textContent.
          const raw = typeof el.innerText === 'string' && el.innerText.trim() ? el.innerText : el.textContent;
          const text = clean(raw);
          if (text) {
            return text;
          }
        }
      } catch (error) {
        // A wrong selector should not stop the other selectors.
      }
    }
    return '';
  }

  // Reads <meta property="..." content="..."> or <meta name="..." content="...">.
  function meta(name) {
    try {
      const el = doc.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
      return el ? clean(el.getAttribute('content')) : '';
    } catch (error) {
      return '';
    }
  }

  // --- JSON-LD helpers ------------------------------------------------------

  // True if @type is "JobPosting" (or a list that has it, or ends with it, like "schema:JobPosting").
  function isJobPosting(type) {
    const types = Array.isArray(type) ? type : [type];
    return types.some(function (t) {
      return typeof t === 'string' && t.endsWith('JobPosting');
    });
  }

  // Looks for a JobPosting object inside the JSON data, up to 6 levels deep.
  function findPosting(node, depth) {
    if (!node || typeof node !== 'object' || depth > 6) {
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findPosting(item, depth + 1);
        if (found) {
          return found;
        }
      }
      return null;
    }
    if (isJobPosting(node['@type'])) {
      return node;
    }
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
      const found = findPosting(node[key], depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  // Reads every <script type="application/ld+json"> and returns the first JobPosting.
  function readJsonLd() {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const text = script.textContent || '';
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (error) {
        // Some sites put real line breaks inside the JSON text. Try once more without them.
        try {
          data = JSON.parse(text.replace(/[\u0000-\u001F]+/g, ' '));
        } catch (secondError) {
          data = null;
        }
      }
      const posting = findPosting(data, 0);
      if (posting) {
        return posting;
      }
    }
    return null;
  }

  // hiringOrganization can be "Acme", { name: "Acme" } or a list of these.
  function readCompany(org) {
    if (Array.isArray(org)) {
      for (const item of org) {
        const name = readCompany(item);
        if (name) {
          return name;
        }
      }
      return '';
    }
    if (typeof org === 'string') {
      return decode(org);
    }
    if (org && typeof org === 'object') {
      return decode(typeof org.name === 'string' ? org.name : '');
    }
    return '';
  }

  // One place: { address: "..." } or { address: { addressLocality, addressRegion, addressCountry } }.
  function readPlace(place) {
    if (!place || typeof place !== 'object') {
      return typeof place === 'string' ? decode(place) : '';
    }
    const address = place.address;
    if (typeof address === 'string') {
      return decode(address);
    }
    if (address && typeof address === 'object') {
      const country = address.addressCountry;
      const countryName = country && typeof country === 'object' ? country.name : country;
      const parts = [address.addressLocality, address.addressRegion, countryName]
        .map(function (part) {
          return typeof part === 'string' ? decode(part) : '';
        })
        .filter(Boolean);
      if (parts.length) {
        return parts.join(', ');
      }
    }
    return typeof place.name === 'string' ? decode(place.name) : '';
  }

  // jobLocation can be one place or a list. We keep at most 3 different places.
  function readLocation(posting) {
    const places = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
    const names = [];
    places.forEach(function (place) {
      const name = readPlace(place);
      if (name && !names.includes(name)) {
        names.push(name);
      }
    });
    const location = names.slice(0, 3).join(' / ');

    const types = Array.isArray(posting.jobLocationType) ? posting.jobLocationType : [posting.jobLocationType];
    const isRemote = types.some(function (t) {
      return typeof t === 'string' && t.toUpperCase().includes('TELECOMMUTE');
    });
    if (isRemote) {
      return location ? 'Remote (' + location + ')' : 'Remote';
    }
    return location;
  }

  // --- Main steps -------------------------------------------------------------

  try {
    result.url = typeof pageUrl === 'string' ? pageUrl : '';

    let hostname = '';
    try {
      hostname = new URL(result.url).hostname.toLowerCase();
    } catch (error) {
      hostname = '';
    }
    const isLinkedIn = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
    const isIndeed = /(^|\.)indeed\.[a-z]{2,3}(\.[a-z]{2})?$/.test(hostname);

    // Step 1: LinkedIn page.
    if (isLinkedIn) {
      try {
        result.title = firstText([
          '.job-details-jobs-unified-top-card__job-title h1',
          '.job-details-jobs-unified-top-card__job-title',
          '.jobs-unified-top-card__job-title',
          '.top-card-layout__title',
          'h1'
        ]);
        result.company = firstText([
          '.job-details-jobs-unified-top-card__company-name a',
          '.job-details-jobs-unified-top-card__company-name',
          '.jobs-unified-top-card__company-name',
          '.topcard__org-name-link',
          '.top-card-layout__second-subline a'
        ]);
        // "Dubai, UAE · 2 weeks ago · 100 applicants" → "Dubai, UAE"
        result.location = clean(
          firstText([
            '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
            '.job-details-jobs-unified-top-card__bullet',
            '.jobs-unified-top-card__bullet',
            '.topcard__flavor--bullet'
          ]).split('·')[0]
        );
        if (result.title) {
          result.method = 'linkedin';
        }
      } catch (error) {
        // Keep going with the next steps.
      }
    }

    // Step 2: Indeed page.
    if (isIndeed) {
      try {
        result.title = firstText([
          '[data-testid="jobsearch-JobInfoHeader-title"]',
          'h1.jobsearch-JobInfoHeader-title',
          'h2.jobsearch-JobInfoHeader-title'
        ]).replace(/\s*-\s*job post$/i, '');
        result.company = firstText([
          '[data-testid="inlineHeader-companyName"]',
          '[data-company-name="true"]',
          '.jobsearch-CompanyInfoContainer a'
        ]);
        result.location = firstText([
          '[data-testid="inlineHeader-companyLocation"]',
          '[data-testid="job-location"]',
          '#jobLocationText'
        ]);
        if (result.title) {
          result.method = 'indeed';
        }
      } catch (error) {
        // Keep going with the next steps.
      }
    }

    // Step 3: JSON-LD, on all sites. It only fills the fields that are still empty.
    try {
      const posting = readJsonLd();
      if (posting) {
        if (!result.title) {
          result.title = decode(typeof posting.title === 'string' ? posting.title : posting.name);
          if (result.title) {
            result.method = 'jsonld';
          }
        }
        if (!result.company) {
          result.company = readCompany(posting.hiringOrganization);
        }
        if (!result.location) {
          result.location = readLocation(posting);
        }
      }
    } catch (error) {
      // Keep going with the fallback.
    }

    // Step 4: fallback to the page title.
    try {
      if (!result.title) {
        result.title = meta('og:title') || clean(doc.title);
        if (result.title) {
          result.method = 'title';
        }
      }
      // On LinkedIn and Indeed the site name is not the company, so we skip it there.
      if (!result.company && !isLinkedIn && !isIndeed) {
        result.company = meta('og:site_name');
      }
    } catch (error) {
      // Return what we have.
    }
  } catch (error) {
    // Never throw: return what we have.
  }

  result.title = result.title.slice(0, MAX_LENGTH);
  result.company = result.company.slice(0, MAX_LENGTH);
  result.location = result.location.slice(0, MAX_LENGTH);
  return result;
}
