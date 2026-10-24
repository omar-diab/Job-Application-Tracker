// Shared code for the popup and the dashboard.
// Load it with a normal <script src="../shared/core.js"></script> tag, before the page's own script.
// Everything here becomes a global name (STATUSES, h, Store, ...) that the next scripts can use.

'use strict';

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

// All possible statuses, in the order we show them.
const STATUSES = Object.freeze([
  Object.freeze({ id: 'saved', label: 'Saved' }),
  Object.freeze({ id: 'applied', label: 'Applied' }),
  Object.freeze({ id: 'interview', label: 'Interview' }),
  Object.freeze({ id: 'offer', label: 'Offer' }),
  Object.freeze({ id: 'rejected', label: 'Rejected' })
]);

// After this many days in "Applied", we show a "maybe follow up" hint.
const FOLLOW_UP_DAYS = 7;

// Returns true if the id is one of the statuses above.
function isValidStatus(id) {
  return STATUSES.some(function (status) {
    return status.id === id;
  });
}

// Returns the label for a status id, for example "applied" → "Applied".
function statusLabel(id) {
  const status = STATUSES.find(function (s) {
    return s.id === id;
  });
  return status ? status.label : id;
}

// ---------------------------------------------------------------------------
// Safe element helper
// ---------------------------------------------------------------------------

// Creates an HTML element in a safe way. Example:
//   h('a', { class: 'link', href: url, text: title })
//   h('ul', null, h('li', null, 'First'), h('li', null, 'Second'))
// Text is always added as text, never as HTML, so "<b>" shows as "<b>" and is not bold.
function h(tag, props, ...children) {
  const el = document.createElement(tag);

  if (props) {
    Object.keys(props).forEach(function (key) {
      const value = props[key];

      // null, undefined and false mean "do not add this".
      if (value === null || value === undefined || value === false) {
        return;
      }

      if (key === 'class') {
        el.className = value;
      } else if (key === 'text') {
        el.textContent = value;
      } else if (key === 'dataset') {
        Object.keys(value).forEach(function (name) {
          if (value[name] !== null && value[name] !== undefined) {
            el.dataset[name] = value[name];
          }
        });
      } else if (key.startsWith('on') && typeof value === 'function') {
        // "onclick" → addEventListener('click', ...)
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        // true means an empty attribute, like <option selected>.
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    });
  }

  appendChildren(el, children);
  return el;
}

// Adds children to an element. Strings and numbers become text nodes.
// Arrays are opened, and null, undefined and false are skipped.
function appendChildren(el, children) {
  children.forEach(function (child) {
    if (child === null || child === undefined || child === false) {
      return;
    }
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  });
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
// We save dates as "YYYY-MM-DD" text in LOCAL time (the user's own day),
// not UTC, so a job saved at 1 AM is not saved as "yesterday".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_STR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Adds a "0" in front of numbers under 10: 5 → "05".
function pad2(number) {
  return String(number).padStart(2, '0');
}

// Turns a Date into "YYYY-MM-DD" (local time).
function toDateStr(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

// Today as "YYYY-MM-DD".
function todayStr() {
  return toDateStr(new Date());
}

// Turns "YYYY-MM-DD" or a full ISO timestamp ("2026-10-24T09:30:00.000Z") into a Date.
// Returns null if the text is not a real date (for example "2026-02-31").
function parseDateStr(str) {
  if (typeof str !== 'string' || str.trim() === '') {
    return null;
  }
  const text = str.trim();

  const match = DATE_STR_PATTERN.exec(text);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    // new Date(2026, 1, 31) moves to 3 March, so we check that nothing moved.
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

// Returns true for a real date written as "YYYY-MM-DD".
function isDateStr(str) {
  return typeof str === 'string' && DATE_STR_PATTERN.test(str) && parseDateStr(str) !== null;
}

// Shows a date in a nice way: "2026-10-24" → "24 Oct 2026". Empty or wrong → "—".
function formatDate(str) {
  const date = parseDateStr(str);
  if (!date) {
    return '—';
  }
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

// How many calendar days from that date until today (0 = today, 1 = yesterday).
// Returns null if the date is empty or wrong.
function daysSince(str) {
  const date = parseDateStr(str);
  if (!date) {
    return null;
  }
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Math.round fixes days that are 23 or 25 hours long (summer time changes).
  return Math.round((today - start) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

// Link parameters that only track where you came from. We remove them.
const TRACKING_PARAMS = ['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'trk', 'trackingid', 'refid', 'gh_src'];

// Matches indeed.com, ae.indeed.com, uk.indeed.com, indeed.co.uk, ...
const INDEED_HOST_PATTERN = /(^|\.)indeed\.[a-z]{2,3}(\.[a-z]{2})?$/;

// Tries to read a text as a web link. Returns a URL object, or null.
function parseHttpUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch (error) {
    return null;
  }
}

// Makes one clean link for each job, so the same job always has the same link.
// We use it to find duplicates.
function normalizeJobUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  const text = url.trim();
  const parsed = parseHttpUrl(text);
  if (!parsed) {
    return text;
  }
  const host = parsed.hostname;

  // LinkedIn: /jobs/view/123456, /jobs/view/some-title-123456 or ?currentJobId=123456
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const pathMatch = /\/jobs\/view\/(?:[^/]*-)?(\d+)/.exec(parsed.pathname);
    const paramId = parsed.searchParams.get('currentJobId');
    const jobId = pathMatch ? pathMatch[1] : paramId && /^\d+$/.test(paramId) ? paramId : null;
    if (jobId) {
      return 'https://www.linkedin.com/jobs/view/' + jobId + '/';
    }
  }

  // Indeed: ?jk=abc123 or ?vjk=abc123
  if (INDEED_HOST_PATTERN.test(host)) {
    const jobKey = parsed.searchParams.get('jk') || parsed.searchParams.get('vjk');
    if (jobKey && /^[a-zA-Z0-9]+$/.test(jobKey)) {
      return 'https://' + host + '/viewjob?jk=' + jobKey;
    }
  }

  // Other sites: remove the #hash and the tracking parameters.
  parsed.hash = '';
  Array.from(parsed.searchParams.keys()).forEach(function (name) {
    const lower = name.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.includes(lower)) {
      parsed.searchParams.delete(name);
    }
  });

  let clean = parsed.toString();
  if (!parsed.search && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

// Returns the link only if it is a normal http:// or https:// link.
// Anything else (like "javascript:alert(1)") returns null, so we never put it in a link.
function safeHref(url) {
  if (typeof url !== 'string') {
    return null;
  }
  const parsed = parseHttpUrl(url.trim());
  return parsed ? parsed.href : null;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
// A job looks like this:
// { id, title, company, location, url, notes, status,
//   dateSaved, dateApplied,                  ← "YYYY-MM-DD" (local)
//   statusChangedAt, createdAt, updatedAt }  ← full ISO timestamps

// The longest text we keep for each field.
const MAX_LENGTH = Object.freeze({
  title: 300,
  company: 200,
  location: 200,
  url: 2000,
  notes: 5000
});

// One line of text: removes extra spaces and line breaks, then cuts it to the max length.
function cleanLine(value, maxLength) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

// Many lines of text (notes): keeps line breaks, but removes extra spaces inside lines
// and keeps at most one empty line between paragraphs.
function cleanMultiline(value, maxLength) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(function (line) {
      return line.replace(/[^\S\n]+/g, ' ').trim();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

// Cleans the fields that came from a form or a web page.
// Only the fields that are given are returned, so it also works for small updates.
// A wrong status or a wrong date is ignored. An empty date ("") means "no date".
function cleanFields(fields) {
  const clean = {};
  if (!fields) {
    return clean;
  }

  ['title', 'company', 'location'].forEach(function (name) {
    if (fields[name] !== undefined && fields[name] !== null) {
      clean[name] = cleanLine(fields[name], MAX_LENGTH[name]);
    }
  });

  if (fields.url !== undefined && fields.url !== null) {
    clean.url = normalizeJobUrl(cleanLine(fields.url, MAX_LENGTH.url)).slice(0, MAX_LENGTH.url);
  }

  if (fields.notes !== undefined && fields.notes !== null) {
    clean.notes = cleanMultiline(fields.notes, MAX_LENGTH.notes);
  }

  if (isValidStatus(fields.status)) {
    clean.status = fields.status;
  }

  ['dateSaved', 'dateApplied'].forEach(function (name) {
    if (fields[name] === '' || isDateStr(fields[name])) {
      clean[name] = fields[name];
    }
  });

  return clean;
}

// Makes a new job from the given fields.
function createJob(fields) {
  const clean = cleanFields(fields);
  const now = new Date().toISOString();

  const job = Object.assign(
    {
      id: crypto.randomUUID(),
      title: '',
      company: '',
      location: '',
      url: '',
      notes: '',
      status: 'saved',
      dateSaved: todayStr(),
      dateApplied: ''
    },
    clean,
    {
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now
    }
  );

  if (!job.dateSaved) {
    job.dateSaved = todayStr();
  }
  if (job.status === 'applied' && !job.dateApplied) {
    job.dateApplied = todayStr();
  }
  return job;
}

// Returns a NEW job with the changes. The old job object is not changed.
function updateJob(job, fields) {
  const clean = cleanFields(fields);
  const now = new Date().toISOString();

  const next = Object.assign({}, job, clean, {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: now
  });

  // The date saved can never be empty.
  if (!next.dateSaved) {
    next.dateSaved = job.dateSaved || todayStr();
  }
  if (next.status !== job.status) {
    next.statusChangedAt = now;
  }
  if (next.status === 'applied' && !next.dateApplied) {
    next.dateApplied = todayStr();
  }
  return next;
}

// How many days since the job was applied for.
// Uses dateApplied, or the time the status changed if there is no dateApplied.
function followUpDays(job) {
  return daysSince(job.dateApplied || job.statusChangedAt);
}

// True if the job has been "Applied" for 7 days or more, so it may be time to follow up.
function followUpDue(job) {
  if (job.status !== 'applied') {
    return false;
  }
  const days = followUpDays(job);
  return days !== null && days >= FOLLOW_UP_DAYS;
}

// ---------------------------------------------------------------------------
// Store (saving jobs in chrome.storage.local)
// ---------------------------------------------------------------------------
// All jobs are saved as one array under the key "jobs", only on this computer.

const STORAGE_KEY = 'jobs';

const Store = {
  // Returns all saved jobs (an empty array if there are none).
  async all() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const jobs = result[STORAGE_KEY];
    return Array.isArray(jobs) ? jobs : [];
  },

  // Replaces all saved jobs with this array.
  async saveAll(jobs) {
    await chrome.storage.local.set({ [STORAGE_KEY]: jobs });
  },

  // Adds the job, or replaces the saved job with the same id.
  async upsert(job) {
    const jobs = await Store.all();
    const index = jobs.findIndex(function (saved) {
      return saved.id === job.id;
    });
    if (index === -1) {
      jobs.push(job);
    } else {
      jobs[index] = job;
    }
    await Store.saveAll(jobs);
    return job;
  },

  // Deletes the job with this id.
  async remove(id) {
    const jobs = await Store.all();
    await Store.saveAll(
      jobs.filter(function (job) {
        return job.id !== id;
      })
    );
  },

  // Finds the job with the same link in a list of jobs. Returns the job, or null.
  // This one is not async: give it the jobs you already loaded with Store.all().
  findByUrl(jobs, url) {
    const key = normalizeJobUrl(url);
    if (!key) {
      return null;
    }
    const found = jobs.find(function (job) {
      return normalizeJobUrl(job.url) === key;
    });
    return found || null;
  }
};
