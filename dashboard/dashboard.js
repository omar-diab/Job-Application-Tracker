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
  sort: 'saved-desc',  // the value of the sort select
  editingId: null      // the id of the job open in the dialog, or null when adding a new job
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
const addBtn = document.getElementById('addBtn');
const exportBtn = document.getElementById('exportBtn');

// The add / edit dialog
const jobDialog = document.getElementById('jobDialog');
const dialogForm = document.getElementById('dialogForm');
const dialogTitle = document.getElementById('dialogTitle');
const dialogError = document.getElementById('dialogError');
const dialogSaveBtn = document.getElementById('dialogSaveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const fTitle = document.getElementById('f-title');
const fCompany = document.getElementById('f-company');
const fLocation = document.getElementById('f-location');
const fUrl = document.getElementById('f-url');
const fStatus = document.getElementById('f-status');
const fDateApplied = document.getElementById('f-dateApplied');
const fNotes = document.getElementById('f-notes');

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
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        'aria-label': 'Edit ' + name,
        dataset: { id: job.id, focusKey: 'edit-' + job.id },
        onclick: function () {
          openEditor(job);
        }
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
// Add / edit dialog
// ---------------------------------------------------------------------------

// Fills the status select of the dialog once, from STATUSES.
function buildStatusOptions() {
  fStatus.replaceChildren(
    ...STATUSES.map(function (status) {
      return h('option', { value: status.id }, status.label);
    })
  );
}

function showDialogError(message) {
  dialogError.textContent = message;
  dialogError.hidden = false;
}

function hideDialogError() {
  dialogError.textContent = '';
  dialogError.hidden = true;
}

// Opens the dialog. With a job: "Edit job". Without: "Add a job" with empty fields.
function openEditor(job) {
  state.editingId = job ? job.id : null;
  dialogTitle.textContent = job ? 'Edit job' : 'Add a job';

  fTitle.value = job ? job.title || '' : '';
  fCompany.value = job ? job.company || '' : '';
  fLocation.value = job ? job.location || '' : '';
  fUrl.value = job ? job.url || '' : '';
  fStatus.value = job ? job.status : 'saved';
  fDateApplied.value = job ? job.dateApplied || '' : '';
  fNotes.value = job ? job.notes || '' : '';

  hideDialogError();
  dialogSaveBtn.disabled = false;
  jobDialog.showModal();
  fTitle.focus();
}

function readEditor() {
  return {
    title: fTitle.value,
    company: fCompany.value,
    location: fLocation.value,
    url: fUrl.value,
    status: fStatus.value,
    dateApplied: fDateApplied.value,
    notes: fNotes.value
  };
}

async function saveEditor() {
  hideDialogError();
  const values = readEditor();

  if (!values.title.trim()) {
    showDialogError('Please enter a job title.');
    fTitle.focus();
    return;
  }
  if (values.url.trim() && !safeHref(values.url)) {
    showDialogError('The link must start with http:// or https://');
    fUrl.focus();
    return;
  }

  dialogSaveBtn.disabled = true;
  try {
    // Read the jobs again: they may have changed since the dialog opened.
    const jobs = await Store.all();

    // The same link must not belong to another job.
    const otherJobs = jobs.filter(function (job) {
      return job.id !== state.editingId;
    });
    const duplicate = Store.findByUrl(otherJobs, values.url);
    if (duplicate) {
      showDialogError('This link is already saved: "' + (duplicate.title || 'Untitled job') + '"');
      fUrl.focus();
      return;
    }

    let job;
    if (state.editingId) {
      const original = jobs.find(function (saved) {
        return saved.id === state.editingId;
      });
      if (!original) {
        showDialogError('This job no longer exists. It may have been deleted in another tab.');
        return;
      }
      job = updateJob(original, values);
    } else {
      job = createJob(values);
    }

    await Store.upsert(job);
    // No render() here: chrome.storage.onChanged will redraw the list.
    jobDialog.close();
  } catch (error) {
    console.error('Could not save the job:', error);
    showDialogError('Could not save the job. Please try again.');
  } finally {
    dialogSaveBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

// One CSV cell: always in double quotes, and " inside becomes "".
// A cell that starts with = + - @ tab or return gets a ' in front,
// so Excel shows it as text and never runs it as a formula.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

function buildCsv(jobs) {
  const header = ['Title', 'Company', 'Location', 'Status', 'Date saved', 'Date applied', 'Link', 'Notes'];
  const rows = jobs
    .slice()
    .sort(byNewestSaved)
    .map(function (job) {
      return [
        job.title,
        job.company,
        job.location,
        statusLabel(job.status),
        job.dateSaved,
        job.dateApplied,
        job.url,
        job.notes
      ];
    });

  const lines = [header].concat(rows).map(function (row) {
    return row.map(csvCell).join(',');
  });

  // ﻿ (the BOM) tells Excel the file is UTF-8, so Arabic shows correctly.
  // \r\n is the Windows line break, which Excel expects.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Saves text as a file, using a temporary link. Needs no extra permission.
function downloadFile(text, fileName) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: fileName, hidden: true });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function exportCsv() {
  if (state.jobs.length === 0) {
    alert('There are no jobs to export yet.');
    return;
  }
  downloadFile(buildCsv(state.jobs), 'job-applications-' + todayStr() + '.csv');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

addBtn.addEventListener('click', function () {
  openEditor(null);
});

exportBtn.addEventListener('click', exportCsv);

dialogForm.addEventListener('submit', function (event) {
  event.preventDefault();
  saveEditor();
});

cancelBtn.addEventListener('click', function () {
  jobDialog.close();
});

// Runs every time the dialog closes: Save, Cancel or the Escape key.
jobDialog.addEventListener('close', function () {
  state.editingId = null;
});

// Choosing "Applied" fills today's date, so you can see it (and change it).
fStatus.addEventListener('change', function () {
  if (fStatus.value === 'applied' && !fDateApplied.value) {
    fDateApplied.value = todayStr();
  }
});

// Hide the error as soon as the user starts fixing the form.
dialogForm.addEventListener('input', hideDialogError);

buildStatusOptions();

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
