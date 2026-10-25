// The dashboard: shows all saved jobs, with filters, search and sort.
// Uses t(), tCount(), I18n from ../shared/i18n.js,
// readLicense(), refreshLicense(), activateLicense(), openUpgrade(), ... from ../shared/premium.js
// and STATUSES, h(), Store, updateJob(), followUpDue(), ... from ../shared/core.js.

'use strict';

// ---------------------------------------------------------------------------
// State: everything the page needs to know to draw itself.
// ---------------------------------------------------------------------------

const state = {
  jobs: [],            // all saved jobs, from chrome.storage.local
  filter: 'all',       // 'all', a status id like 'applied', or 'followup'
  search: '',          // what is in the search box
  sort: 'saved-desc',  // the value of the sort select
  editingId: null,     // the id of the job open in the dialog, or null when adding a new job
  premium: false,      // true if the user has Premium (saved on this computer)
  license: null,       // the saved license (to show the end of the key)
  licenseInput: '',    // what the user typed in the license key field
  licenseBusy: false,  // true while the key is checked with Dodo
  premiumError: ''     // an error to show in the Premium dialog
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
const languageSelect = document.getElementById('languageSelect');
const premiumBtn = document.getElementById('premiumBtn');

// The Premium dialog
const premiumDialog = document.getElementById('premiumDialog');
const premiumBody = document.getElementById('premiumBody');
const premiumCloseBtn = document.getElementById('premiumCloseBtn');

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

// True if the job fits the chosen filter chip.
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

// Compares text in the order of the chosen language (works for Arabic too),
// and ignores upper/lower case. One collator per language, made only when needed.
const collators = {};

function getCollator() {
  const locale = I18n.locale();
  if (!collators[locale]) {
    collators[locale] = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  }
  return collators[locale];
}

// Text A–Z. Empty values always go to the end.
function compareText(a, b) {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  return getCollator().compare(a, b);
}

// Dates ("YYYY-MM-DD" or ISO timestamps can be compared as text).
// Empty values always go to the end, also when newest comes first.
function compareDates(a, b, newestFirst) {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  const result = a < b ? -1 : a > b ? 1 : 0;
  return newestFirst ? -result : result;
}

// The position of a status in STATUSES: Saved = 0, Applied = 1, ... Rejected = 4.
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

// Asks first, then deletes the job. The list redraws through chrome.storage.onChanged.
async function deleteJob(job) {
  if (!confirm(t('confirmDelete', job.title || t('thisJob')))) {
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

// Draws the "All" chip, one chip per status (with counts) and the follow-up chip.
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

  chips.push(chip('all', t('filterAll'), state.jobs.length, null));
  STATUSES.forEach(function (status) {
    const count = state.jobs.filter(function (job) {
      return job.status === status.id;
    }).length;
    chips.push(chip(status.id, statusLabel(status.id), count, 'st-' + status.id));
  });

  // The follow-up chip only shows when it is useful.
  if (followUpCount > 0 || state.filter === 'followup') {
    chips.push(chip('followup', t('filterFollowUp'), followUpCount, null));
  }

  filtersBox.replaceChildren(...chips);
}

// Shows the orange banner when some applications need a follow-up.
function renderFollowUpBanner(followUpCount) {
  if (followUpCount === 0) {
    followUpBanner.hidden = true;
    followUpBanner.replaceChildren();
    return;
  }

  const message = tCount('bannerFollowUp', followUpCount, [FOLLOW_UP_DAYS]);

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
        }, t('showThem'))
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

// Title cell: a safe link (or plain text), the follow-up badge and a notes preview.
function titleCell(job) {
  const title = job.title || t('untitledJob');
  const href = safeHref(job.url);

  const titleEl = href
    ? h('a', { class: 'job-title cell-text', dir: 'auto', href: href, target: '_blank', rel: 'noopener noreferrer', text: title })
    : h('span', { class: 'job-title cell-text', dir: 'auto', text: title });

  let badge = null;
  if (followUpDue(job)) {
    badge = h('span', {
      class: 'followup-badge',
      title: t('followUpTooltip', followUpDays(job))
    }, t('followUpBadge'));
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

  return h('td', { class: 'col-title', 'data-label': t('colTitle') }, titleEl, badge, notes);
}

// Status cell: a select that looks like a colored pill. Changing it saves right away.
function statusCell(job) {
  const select = h('select', {
    class: 'status-select',
    'aria-label': t('statusFor', job.title || t('thisJob')),
    dataset: { focusKey: 'status-' + job.id },
    onchange: function (event) {
      changeStatus(job.id, event.target.value);
    }
  },
    STATUSES.map(function (status) {
      return h('option', { value: status.id, selected: status.id === job.status }, statusLabel(status.id));
    })
  );

  return h('td', { 'data-label': t('colStatus') },
    h('span', { class: 'status-wrap st-' + job.status }, select)
  );
}

// Actions cell: the Edit and Delete buttons.
function actionsCell(job) {
  const name = job.title || t('thisJob');
  return h('td', { class: 'col-actions', 'data-label': t('colActions') },
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        'aria-label': t('editJobLabel', name),
        dataset: { id: job.id, focusKey: 'edit-' + job.id },
        onclick: function () {
          openEditor(job);
        }
      }, t('edit')),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm danger',
        'aria-label': t('deleteJobLabel', name),
        onclick: function () {
          deleteJob(job);
        }
      }, t('delete'))
    )
  );
}

// One table row for one job. data-label on each cell is used by the phone card view.
function jobRow(job) {
  return h('tr', { dataset: { id: job.id } },
    titleCell(job),
    textCell(t('colCompany'), job.company),
    textCell(t('colLocation'), job.location),
    statusCell(job),
    h('td', { class: 'col-date', 'data-label': t('colSaved'), text: formatDate(job.dateSaved) }),
    h('td', { class: 'col-date', 'data-label': t('colApplied'), text: formatDate(job.dateApplied) }),
    actionsCell(job)
  );
}

// Shows a friendly message instead of the table when there is nothing to show.
function renderEmptyState(visibleCount) {
  if (state.jobs.length === 0) {
    emptyTitle.textContent = t('emptyNoJobsTitle');
    emptyText.textContent = t('emptyNoJobsText');
  } else if (visibleCount === 0) {
    emptyTitle.textContent = t('emptyNoMatchTitle');
    emptyText.textContent = t('emptyNoMatchText');
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

  totalCount.textContent = tCount('jobCount', state.jobs.length);
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

// Fills the status select of the dialog from STATUSES (again when the language changes).
function buildStatusOptions() {
  const chosen = fStatus.value;
  fStatus.replaceChildren(
    ...STATUSES.map(function (status) {
      return h('option', { value: status.id }, statusLabel(status.id));
    })
  );
  if (chosen) {
    fStatus.value = chosen;
  }
}

// The dialog title: "Add a job" or "Edit job".
function updateDialogTitle() {
  dialogTitle.textContent = t(state.editingId ? 'dialogEditTitle' : 'dialogAddTitle');
}

// Shows a red message in the dialog.
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
  updateDialogTitle();

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

// Reads what is in the dialog fields now.
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

// Checks the dialog fields, then adds or updates the job.
async function saveEditor() {
  hideDialogError();
  const values = readEditor();

  if (!values.title.trim()) {
    showDialogError(t('errorTitleRequired'));
    fTitle.focus();
    return;
  }
  if (values.url.trim() && !safeHref(values.url)) {
    showDialogError(t('errorBadLink'));
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
      showDialogError(t('errorDuplicateLink', duplicate.title || t('untitledJob')));
      fUrl.focus();
      return;
    }

    let job;
    if (state.editingId) {
      const original = jobs.find(function (saved) {
        return saved.id === state.editingId;
      });
      if (!original) {
        showDialogError(t('errorJobGone'));
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
    showDialogError(t('errorSaveFailed'));
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

// The invisible "Byte Order Mark" at the start of the file (see buildCsv).
const BOM = String.fromCharCode(0xfeff);

// Makes the whole CSV text: a header row, then all jobs, newest saved first.
// The column names and the status names are in the chosen language.
function buildCsv(jobs) {
  const header = [
    t('csvTitle'),
    t('csvCompany'),
    t('csvLocation'),
    t('csvStatus'),
    t('csvDateSaved'),
    t('csvDateApplied'),
    t('csvLink'),
    t('csvNotes')
  ];
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

  // The BOM tells Excel the file is UTF-8, so Arabic shows correctly.
  // \r\n is the Windows line break, which Excel expects.
  return BOM + lines.join('\r\n') + '\r\n';
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

// Exports ALL jobs (not only the filtered ones).
function exportCsv() {
  if (state.jobs.length === 0) {
    alert(t('alertNoJobsToExport'));
    return;
  }
  downloadFile(buildCsv(state.jobs), 'job-applications-' + todayStr() + '.csv');
}

// ---------------------------------------------------------------------------
// Premium
// ---------------------------------------------------------------------------

// The top bar button: "⭐ Go Premium" for free users, a "⭐ Premium" badge for Premium users.
function renderPremiumButton() {
  premiumBtn.textContent = t(state.premium ? 'premiumBadge' : 'goPremium');
  premiumBtn.classList.toggle('is-premium', state.premium);
  premiumBtn.hidden = false;
}

// A price in the chosen language and the plan's currency: 499 cents + "usd" → "$4.99".
function formatPrice(plan) {
  const amount = plan.unitAmountCents / 100;
  const currency = String(plan.currency || '').toUpperCase();
  try {
    return new Intl.NumberFormat(I18n.locale(), { style: 'currency', currency: currency }).format(amount);
  } catch (error) {
    return amount.toFixed(2) + ' ' + currency;
  }
}

// "Monthly", "Yearly" or "One-time payment".
function planName(plan) {
  if (plan.interval === 'month') {
    return t('planMonthly');
  }
  if (plan.interval === 'year') {
    return t('planYearly');
  }
  return t('planOnce');
}

// "$4.99 / month", "$39 / year", "$9.99 every 3 months", "$59 once".
function planPrice(plan) {
  const price = formatPrice(plan);
  const count = plan.intervalCount || 1;
  if (plan.interval === 'month') {
    return count > 1 ? t('pricePerMonths', [price, count]) : t('pricePerMonth', price);
  }
  if (plan.interval === 'year') {
    return count > 1 ? t('pricePerYears', [price, count]) : t('pricePerYear', price);
  }
  return t('priceOnce', price);
}

// The license errors from premium.js, as message keys.
const LICENSE_ERROR_KEYS = Object.freeze({
  empty: 'licenseRequired',
  not_found: 'licenseInvalid',
  inactive: 'licenseInactive',
  limit: 'licenseLimit',
  network: 'licenseNetworkError'
});

// One plan: its name, its price and a "Choose" button that opens the Dodo checkout.
function planCard(plan) {
  const name = planName(plan);
  return h('div', { class: 'plan-card' },
    h('div', { class: 'plan-name', text: name }),
    h('div', { class: 'plan-price', text: planPrice(plan) }),
    h('button', {
      type: 'button',
      class: 'btn btn-primary btn-sm',
      'aria-label': t('choosePlanLabel', name),
      onclick: function () {
        openUpgrade(plan.id).catch(function (error) {
          console.error('Could not open the checkout page:', error);
        });
      }
    }, t('choosePlan'))
  );
}

// The plans, cheapest first.
function plansSection() {
  const plans = loadPlans().slice().sort(function (a, b) {
    return a.unitAmountCents - b.unitAmountCents;
  });
  return h('div', { class: 'plan-list' }, plans.map(planCard));
}

// "Already bought Premium?": a field for the license key and an Activate button.
function licenseForm() {
  const input = h('input', {
    type: 'text',
    id: 'licenseInput',
    class: 'license-input',
    dir: 'ltr',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: t('licensePlaceholder'),
    disabled: state.licenseBusy,
    oninput: function (event) {
      state.licenseInput = event.target.value;
    }
  });
  input.value = state.licenseInput;

  return h('form', {
    class: 'license-form',
    novalidate: true,
    onsubmit: function (event) {
      event.preventDefault();
      activateFromForm();
    }
  },
    h('label', { for: 'licenseInput', class: 'premium-heading license-label', text: t('licenseHaveKey') }),
    h('div', { class: 'license-row' },
      input,
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm', disabled: state.licenseBusy },
        t(state.licenseBusy ? 'licenseActivating' : 'licenseActivate'))
    ),
    h('p', { class: 'premium-muted', text: t('licenseEmailHint') })
  );
}

// Activates the key the user typed. On success, onPremiumChange() redraws the page.
async function activateFromForm() {
  state.licenseBusy = true;
  state.premiumError = '';
  renderPremiumDialog();
  try {
    await activateLicense(state.licenseInput);
    state.licenseInput = '';
  } catch (error) {
    console.warn('Could not activate the license:', error);
    state.premiumError = t(LICENSE_ERROR_KEYS[error.code] || 'licenseNetworkError');
  } finally {
    state.licenseBusy = false;
    renderPremiumDialog();
    const input = document.getElementById('licenseInput');
    if (input && state.premiumError) {
      input.focus();
    }
  }
}

// Removes the license from this computer (to use it on another one).
async function removeLicenseFromComputer() {
  if (!confirm(t('licenseRemoveConfirm'))) {
    return;
  }
  try {
    await removeLicense();
  } catch (error) {
    console.error('Could not remove the license:', error);
  }
}

// Draws the inside of the Premium dialog again from the state.
function renderPremiumDialog() {
  const benefits = h('ul', { class: 'premium-benefits' },
    ['premiumNoAds', 'premiumSupport', 'premiumAiSoon'].map(function (key) {
      return h('li', { text: t(key) });
    })
  );
  const parts = [];

  if (state.premium) {
    const licenseKey = state.license && state.license.licenseKey;
    parts.push(
      h('p', { class: 'premium-active', text: t('premiumActive') }),
      h('h3', { class: 'premium-heading', text: t('premiumIncluded') }),
      benefits,
      licenseKey ? h('p', { class: 'premium-muted license-key', dir: 'auto', text: t('licenseOnThisComputer', maskLicenseKey(licenseKey)) }) : null,
      h('p', { class: 'premium-muted', text: t('manageHint') }),
      h('div', { class: 'premium-actions' },
        h('button', { type: 'button', class: 'btn btn-sm danger', onclick: removeLicenseFromComputer }, t('licenseRemove'))
      )
    );
  } else {
    parts.push(
      h('p', { class: 'premium-intro', text: t('premiumIntro') }),
      h('h3', { class: 'premium-heading', text: t('premiumIncluded') }),
      benefits,
      h('h3', { class: 'premium-heading', text: t('premiumChoosePlan') }),
      plansSection(),
      licenseForm()
    );
  }

  if (state.premiumError) {
    parts.push(h('p', { class: 'form-error', role: 'alert', text: state.premiumError }));
  }
  parts.push(h('p', { class: 'premium-note', text: t('premiumSecureNote') }));

  premiumBody.replaceChildren(...parts);
}

function openPremiumDialog() {
  state.premiumError = '';
  renderPremiumDialog();
  if (!premiumDialog.open) {
    premiumDialog.showModal();
  }
}

premiumBtn.addEventListener('click', openPremiumDialog);

premiumCloseBtn.addEventListener('click', function () {
  premiumDialog.close();
});

// After an activation, a removal or a check in another tab, the saved status changes
// and the page follows.
onPremiumChange(function (premium, license) {
  state.premium = premium;
  state.license = license;
  renderPremiumButton();
  if (premiumDialog.open) {
    renderPremiumDialog();
  }
});

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
// The same for the language: if it changes in another tab, this page follows.
chrome.storage.onChanged.addListener(async function (changes, areaName) {
  if (areaName !== 'local') {
    return;
  }
  if (changes.jobs) {
    const jobs = changes.jobs.newValue;
    state.jobs = Array.isArray(jobs) ? jobs : [];
    render();
  }
  const language = changes[LANGUAGE_SETTING_KEY];
  if (language && language.newValue && language.newValue !== I18n.lang) {
    await I18n.use(language.newValue);
    refreshLanguage();
  }
});

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

// Fills the language picker. Each language is shown in its own name.
function buildLanguageOptions() {
  languageSelect.replaceChildren(
    ...LANGUAGES.map(function (language) {
      return h('option', { value: language.code, lang: language.code.replace(/_/g, '-') }, language.name);
    })
  );
  languageSelect.value = I18n.lang;
}

// Updates everything that is not filled by data-i18n.
// (I18n.use() already filled the data-i18n texts and set <html lang dir>.)
function refreshLanguage() {
  languageSelect.value = I18n.lang;
  buildStatusOptions();
  if (jobDialog.open) {
    updateDialogTitle();
  }
  renderPremiumButton();
  if (premiumDialog.open) {
    renderPremiumDialog();
  }
  render();
}

languageSelect.addEventListener('change', async function () {
  try {
    await I18n.setLanguage(languageSelect.value);
  } catch (error) {
    console.error('Could not change the language:', error);
  }
  refreshLanguage();
});

// Loads the translations and the saved jobs, and draws the page for the first time.
async function init() {
  await I18n.init();

  // Premium: show the saved status at once, then check online in the background
  // (at most every 12 hours). If it changed, onPremiumChange() updates the page.
  state.license = await readLicense();
  state.premium = Boolean(state.license && state.license.premium);
  renderPremiumButton();
  refreshLicense();

  buildLanguageOptions();
  buildStatusOptions();
  sortSelect.value = state.sort;
  try {
    state.jobs = await Store.all();
  } catch (error) {
    console.error('Could not load jobs:', error);
  }
  render();

  // The popup's "⭐ Premium" link opens dashboard.html#premium.
  if (location.hash === '#premium') {
    history.replaceState(null, '', location.pathname + location.search);
    openPremiumDialog();
  }
}

init();
