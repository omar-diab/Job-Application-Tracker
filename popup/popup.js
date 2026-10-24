// The popup: reads the job from the current tab, and saves or updates it.
// Uses STATUSES, h(), Store, createJob(), ... from ../shared/core.js
// and extractJobInfo() from ../shared/extractor.js.

'use strict';

// ---------------------------------------------------------------------------
// Page elements
// ---------------------------------------------------------------------------

const form = document.getElementById('jobForm');
const titleInput = document.getElementById('title');
const companyInput = document.getElementById('company');
const locationInput = document.getElementById('location');
const urlInput = document.getElementById('url');
const notesInput = document.getElementById('notes');
const statusPicker = document.getElementById('statusPicker');
const notice = document.getElementById('notice');
const formError = document.getElementById('formError');
const saveBtn = document.getElementById('saveBtn');
const openDashboardBtn = document.getElementById('openDashboard');

// The id of the saved job we are showing. null means "a new job".
let currentJobId = null;

// ---------------------------------------------------------------------------
// Small helpers for the form
// ---------------------------------------------------------------------------

// Makes one chip for each status: a hidden radio input + a visible span.
function buildStatusPicker() {
  STATUSES.forEach(function (status) {
    statusPicker.appendChild(
      h('label', { class: 'chip st-' + status.id },
        h('input', { type: 'radio', name: 'status', value: status.id }),
        h('span', { text: status.label })
      )
    );
  });
}

function getStatus() {
  return form.elements.status.value || 'saved';
}

function setStatus(id) {
  form.elements.status.value = id;
}

// Puts a job (or the page data) into the form.
function fillForm(data) {
  titleInput.value = data.title || '';
  companyInput.value = data.company || '';
  locationInput.value = data.location || '';
  urlInput.value = data.url || '';
  notesInput.value = data.notes || '';
  setStatus(data.status || 'saved');
}

// Reads what is in the form now.
function readForm() {
  return {
    title: titleInput.value,
    company: companyInput.value,
    location: locationInput.value,
    url: urlInput.value,
    notes: notesInput.value,
    status: getStatus()
  };
}

// Shows a notice. type is "info", "warning" or "success".
// children can be strings or elements (made with h()).
function showNotice(type, ...children) {
  notice.className = 'notice notice-' + type;
  notice.replaceChildren(...children);
  notice.hidden = false;
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function hideError() {
  formError.textContent = '';
  formError.hidden = true;
}

// Shows that the job is already saved, and switches the form to "update" mode.
function showSavedJob(job) {
  currentJobId = job.id;
  fillForm(job);
  showNotice(
    'info',
    'Already saved on ' + formatDate(job.dateSaved),
    h('span', { class: 'pill st-' + job.status, text: statusLabel(job.status) })
  );
  saveBtn.textContent = 'Update job';
}

// ---------------------------------------------------------------------------
// Reading the current tab
// ---------------------------------------------------------------------------

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// Only normal web pages can be read (not chrome:// pages or the new tab page).
function isWebPage(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Runs extractJobInfo() inside the tab. If that fails, uses the tab title and link.
async function readPage(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobInfo
    });
    const info = results && results[0] && results[0].result;
    if (info) {
      return info;
    }
  } catch (error) {
    // For example the Chrome Web Store, where extensions are not allowed to run.
    console.warn('Could not read the page:', error);
  }

  const title = (tab.title || '').trim();
  return {
    title: title,
    company: '',
    location: '',
    url: tab.url,
    method: title ? 'title' : 'none'
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function init() {
  buildStatusPicker();
  setStatus('saved');
  titleInput.focus();

  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (error) {
    console.warn('Could not get the active tab:', error);
  }

  if (!tab || !isWebPage(tab.url)) {
    showNotice('warning', "This page can't be read. You can still add a job by hand.");
    return;
  }

  const page = await readPage(tab);

  let jobs = [];
  try {
    jobs = await Store.all();
  } catch (error) {
    console.error('Could not load saved jobs:', error);
  }

  const savedJob = Store.findByUrl(jobs, page.url);
  if (savedJob) {
    showSavedJob(savedJob);
  } else {
    fillForm({
      title: page.title,
      company: page.company,
      location: page.location,
      url: normalizeJobUrl(page.url),
      status: 'saved'
    });

    if (page.method === 'none' || !page.title) {
      showNotice('warning', "Couldn't find job details. Please fill them in.");
    } else if (page.method === 'title') {
      showNotice('warning', 'We used the page title. Please check the details.');
    }
  }

  titleInput.focus();
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  hideError();

  const values = readForm();

  if (!values.title.trim()) {
    showError('Please enter a job title.');
    titleInput.focus();
    return;
  }
  if (values.url.trim() && !safeHref(values.url)) {
    showError('The link must start with http:// or https://');
    urlInput.focus();
    return;
  }

  saveBtn.disabled = true;
  try {
    // Read the jobs again: they may have changed since the popup opened
    // (for example in the dashboard), and the link in the form may have changed.
    const jobs = await Store.all();
    const existing =
      jobs.find(function (job) {
        return job.id === currentJobId;
      }) || Store.findByUrl(jobs, values.url);

    const job = existing ? updateJob(existing, values) : createJob(values);
    await Store.upsert(job);

    currentJobId = job.id;
    fillForm(job);
    showNotice('success', existing ? '✓ Job updated' : '✓ Job saved');
    saveBtn.textContent = 'Update job';
  } catch (error) {
    console.error('Could not save the job:', error);
    showError('Could not save the job. Please try again.');
  } finally {
    saveBtn.disabled = false;
  }
});

// Hide the error as soon as the user starts fixing the form.
form.addEventListener('input', hideError);

openDashboardBtn.addEventListener('click', async function () {
  await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

init();
