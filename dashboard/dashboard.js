// The dashboard: shows all saved jobs, with filters, search and sort.
// Uses STATUSES, h(), Store, updateJob(), followUpDue(), ... from ../shared/core.js.

'use strict';

// ---------------------------------------------------------------------------
// State: everything the page needs to know to draw itself.
// ---------------------------------------------------------------------------

const state = {
  jobs: [],            // all saved jobs, from chrome.storage.local
  filter: 'all',       // 'all', a status id like 'applied', or 'followup'
  search: '',          // what is in the search box
  sort: 'saved-desc'   // the value of the sort select
};

// ---------------------------------------------------------------------------
// Page elements
// ---------------------------------------------------------------------------

const totalCount = document.getElementById('totalCount');
const filtersBox = document.getElementById('filters');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const followUpBanner = document.getElementById('followUpBanner');
const tableWrap = document.getElementById('tableWrap');
const jobsBody = document.getElementById('jobsBody');
const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const emptyText = document.getElementById('emptyText');

// ---------------------------------------------------------------------------
// Filtering and searching
// ---------------------------------------------------------------------------

function matchesFilter(job, filter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'followup') {
    return followUpDue(job);
  }
  return job.status === filter;
}

// Case-insensitive search in title, company, location and notes.
function matchesSearch(job, search) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) {
    return true;
  }
  const text = [job.title, job.company, job.location, job.notes].join('\n').toLocaleLowerCase();
  return text.includes(query);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// Compares text in a way that works for Arabic and English, and ignores upper/lower case.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

// Text A–Z. Empty values always go to the end.
function compareText(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return collator.compare(a, b);
}

// Dates ("YYYY-MM-DD" or ISO timestamps can be compared as text).
// Empty values always go to the end, also when newest comes first.
function compareDates(a, b, newestFirst) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const result = a < b ? -1 : a > b ? 1 : 0;
  return newestFirst ? -result : result;
}

function statusOrder(id) {
  return STATUSES.findIndex(function (status) {
    return status.id === id;
  });
}

// Newest saved first. Used alone, and as a tie-breaker for the other sorts.
function byNewestSaved(a, b) {
  return compareDates(a.dateSaved, b.dateSaved, true) || compareDates(a.createdAt, b.createdAt, true);
}

const SORTERS = {
  'saved-desc': byNewestSaved,
  'saved-asc': function (a, b) {
    return compareDates(a.dateSaved, b.dateSaved, false) || compareDates(a.createdAt, b.createdAt, false);
  },
  'applied-desc': function (a, b) {
    return compareDates(a.dateApplied, b.dateApplied, true) || byNewestSaved(a, b);
  },
  'updated-desc': function (a, b) {
    return compareDates(a.updatedAt, b.updatedAt, true);
  },
  'company-asc': function (a, b) {
    return compareText(a.company, b.company) || compareText(a.title, b.title);
  },
  'title-asc': function (a, b) {
    return compareText(a.title, b.title) || compareText(a.company, b.company);
  },
  status: function (a, b) {
    return statusOrder(a.status) - statusOrder(b.status) || byNewestSaved(a, b);
  }
};

// The jobs to show now: filtered, searched and sorted.
function visibleJobs() {
  const sorter = SORTERS[state.sort] || byNewestSaved;
  return state.jobs
    .filter(function (job) {
      return matchesFilter(job, state.filter) && matchesSearch(job, state.search);
    })
    .sort(sorter);
}

// ---------------------------------------------------------------------------
// Saving changes from the list
// ---------------------------------------------------------------------------

// Changes the status of one job. We read the latest saved version first,
// so we never overwrite a change made in the popup.
async function changeStatus(jobId, status) {
  try {
    const jobs = await Store.all();
    const job = jobs.find(function (saved) {
      return saved.id === jobId;
    });
    if (job) {
      await Store.upsert(updateJob(job, { status: status }));
    }
  } catch (error) {
    console.error('Could not change the status:', error);
    render();
  }
}

async function deleteJob(job) {
  if (!confirm('Delete "' + (job.title || 'this job') + '"?')) {
    return;
  }
  try {
    await Store.remove(job.id);
  } catch (error) {
    console.error('Could not delete the job:', error);
  }
}

// ---------------------------------------------------------------------------
// Building the parts of the page (only with h(), never innerHTML)
// ---------------------------------------------------------------------------

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

function renderFilters(followUpCount) {
  const chips = [];

  function chip(id, label, count, extraClass) {
    return h('button', {
      type: 'button',
      class: 'filter-chip' + (extraClass ? ' ' + extraClass : ''),
      'aria-pressed': String(state.filter === id),
      dataset: { focusKey: 'filter-' + id },
      onclick: function () {
        state.filter = id;
        render();
      }
    },
      extraClass ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null,
      label,
      h('span', { class: 'count', text: String(count) })
    );
  }

  chips.push(chip('all', 'All', state.jobs.length, null));
  STATUSES.forEach(function (status) {
    const count = state.jobs.filter(function (job) {
      return job.status === status.id;
    }).length;
    chips.push(chip(status.id, status.label, count, 'st-' + status.id));
  });

  // The follow-up chip only shows when it is useful.
  if (followUpCount > 0 || state.filter === 'followup') {
    chips.push(chip('followup', '⏰ Follow up', followUpCount, null));
  }

  filtersBox.replaceChildren(...chips);
}

function renderFollowUpBanner(followUpCount) {
  if (followUpCount === 0) {
    followUpBanner.hidden = true;
    followUpBanner.replaceChildren();
    return;
  }

  const message = followUpCount === 1
    ? '⏰ 1 application was sent ' + FOLLOW_UP_DAYS + '+ days ago with no update.'
    : '⏰ ' + followUpCount + ' applications were sent ' + FOLLOW_UP_DAYS + '+ days ago with no update.';

  followUpBanner.replaceChildren(
    h('span', { text: message }),
    state.filter === 'followup'
      ? null
      : h('button', {
          type: 'button',
          class: 'btn btn-sm',
          onclick: function () {
            state.filter = 'followup';
            render();
          }
        }, 'Show them')
  );
  followUpBanner.hidden = false;
}

// A table cell with user text. Shows "—" when empty.
function textCell(label, value) {
  return h('td', { 'data-label': label },
    value
      ? h('span', { class: 'cell-text', dir: 'auto', text: value })
      : h('span', { class: 'cell-empty', text: '—' })
  );
}

function titleCell(job) {
  const title = job.title || 'Untitled job';
  const href = safeHref(job.url);

  const titleEl = href
    ? h('a', { class: 'job-title cell-text', dir: 'auto', href: href, target: '_blank', rel: 'noopener noreferrer', text: title })
    : h('span', { class: 'job-title cell-text', dir: 'auto', text: title });

  let badge = null;
  if (followUpDue(job)) {
    badge = h('span', {
      class: 'followup-badge',
      title: 'Applied ' + followUpDays(job) + ' days ago, no update'
    }, '⏰ Maybe follow up');
  }

  let notes = null;
  if (job.notes) {
    notes = h('p', {
      class: 'notes-preview',
      dir: 'auto',
      title: job.notes,
      text: job.notes.replace(/\s+/g, ' ')
    });
  }

  return h('td', { class: 'col-title', 'data-label': 'Title' }, titleEl, badge, notes);
}

function statusCell(job) {
  const select = h('select', {
    class: 'status-select',
    'aria-label': 'Status for ' + (job.title || 'this job'),
    dataset: { focusKey: 'status-' + job.id },
    onchange: function (event) {
      changeStatus(job.id, event.target.value);
    }
  },
    STATUSES.map(function (status) {
      return h('option', { value: status.id, selected: status.id === job.status }, status.label);
    })
  );

  return h('td', { 'data-label': 'Status' },
    h('span', { class: 'status-wrap st-' + job.status }, select)
  );
}

function actionsCell(job) {
  const name = job.title || 'this job';
  return h('td', { class: 'col-actions', 'data-label': 'Actions' },
    h('div', { class: 'row-actions' },
      // The Edit button does nothing yet. It will open the edit dialog in step 7.
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        'aria-label': 'Edit ' + name,
        dataset: { id: job.id, focusKey: 'edit-' + job.id }
      }, 'Edit'),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm danger',
        'aria-label': 'Delete ' + name,
        onclick: function () {
          deleteJob(job);
        }
      }, 'Delete')
    )
  );
}

function jobRow(job) {
  return h('tr', { dataset: { id: job.id } },
    titleCell(job),
    textCell('Company', job.company),
    textCell('Location', job.location),
    statusCell(job),
    h('td', { class: 'col-date', 'data-label': 'Saved', text: formatDate(job.dateSaved) }),
    h('td', { class: 'col-date', 'data-label': 'Applied', text: formatDate(job.dateApplied) }),
    actionsCell(job)
  );
}

function renderEmptyState(visibleCount) {
  if (state.jobs.length === 0) {
    emptyTitle.textContent = 'No jobs saved yet';
    emptyText.textContent =
      'Open a job post on LinkedIn, Indeed or any career site, then click the extension icon to save it.';
  } else if (visibleCount === 0) {
    emptyTitle.textContent = 'No jobs match your filters';
    emptyText.textContent = 'Try another status or clear the search.';
  }

  const isEmpty = visibleCount === 0;
  emptyState.hidden = !isEmpty;
  tableWrap.hidden = isEmpty;
}

// ---------------------------------------------------------------------------
// render(): draws the whole page again from the state.
// Call it after ANY change: new jobs, a filter click, typing in search, ...
// ---------------------------------------------------------------------------

function render() {
  // Remember which button or select had the keyboard focus, so we can put it back.
  const focused = document.activeElement;
  const focusKey = focused && focused.dataset ? focused.dataset.focusKey : null;

  const followUpCount = state.jobs.filter(followUpDue).length;
  const jobs = visibleJobs();

  totalCount.textContent = plural(state.jobs.length, 'job');
  renderFilters(followUpCount);
  renderFollowUpBanner(followUpCount);
  jobsBody.replaceChildren(...jobs.map(jobRow));
  renderEmptyState(jobs.length);

  if (focusKey) {
    const again = document.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
    if (again) {
      again.focus();
    }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

searchInput.addEventListener('input', function () {
  state.search = searchInput.value;
  render();
});

sortSelect.addEventListener('change', function () {
  state.sort = sortSelect.value;
  render();
});

// When jobs change anywhere (the popup, another dashboard tab, or this page),
// Chrome tells us here, and we draw the list again.
chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName === 'local' && changes.jobs) {
    const jobs = changes.jobs.newValue;
    state.jobs = Array.isArray(jobs) ? jobs : [];
    render();
  }
});

async function init() {
  sortSelect.value = state.sort;
  try {
    state.jobs = await Store.all();
  } catch (error) {
    console.error('Could not load jobs:', error);
  }
  render();
}

init();
