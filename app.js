import { createAuth0Client } from '@auth0/auth0-spa-js';

const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorDetails = document.getElementById('error-details');
const app = document.getElementById('app');
const loggedOutSection = document.getElementById('logged-out');
const loggedInSection = document.getElementById('logged-in');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const profileContainer = document.getElementById('profile');

const activityForm = document.getElementById('activity-form');
const activityInput = document.getElementById('activity-input');
const activityAddBtn = document.getElementById('activity-add-btn');
const activityStatus = document.getElementById('activity-status');
const activityList = document.getElementById('activity-list');

const workspaceTabs = document.querySelectorAll('[data-workspace-view]');
const workspacePanels = document.querySelectorAll('[data-workspace-panel]');

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchStatus = document.getElementById('search-status');
const searchResults = document.getElementById('search-results');

const placeholderImage = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110' viewBox='0 0 110 110'%3E%3Ccircle cx='55' cy='55' r='55' fill='%2363b3ed'/%3E%3Cpath d='M55 50c8.28 0 15-6.72 15-15s-6.72-15-15-15-15 6.72-15 15 6.72 15 15 15zm0 7.5c-10 0-30 5.02-30 15v3.75c0 2.07 1.68 3.75 3.75 3.75h52.5c2.07 0 3.75-1.68 3.75-3.75V72.5c0-9.98-20-15-30-15z' fill='%23fff'/%3E%3C/svg%3E`;

let auth0Client;
let currentUser = null;
let profileRequestSeq = 0;
const callbackUri = resolveCallbackUri();

async function initAuth0() {
  try {
    const domain = import.meta.env.VITE_AUTH0_DOMAIN;
    const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

    if (!domain || !clientId) {
      throw new Error('Auth0 configuration missing. Please check .env.local for VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID');
    }

    auth0Client = await createAuth0Client({
      domain,
      clientId,
      authorizationParams: {
        redirect_uri: callbackUri,
        scope: 'openid profile email'
      }
    });

    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      await handleRedirectCallback();
    }

    await updateUI();
  } catch (err) {
    console.error('Auth0 initialization error:', err);
    showError(err.message);
  }
}

async function handleRedirectCallback() {
  try {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, '/');
  } catch (err) {
    console.error('Redirect callback error:', err);
    showError(err.message);
  }
}

async function updateUI() {
  try {
    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
      showLoggedIn();
    } else {
      showLoggedOut();
    }

    hideLoading();
  } catch (err) {
    console.error('UI update error:', err);
    showError(err.message);
  }
}

async function displayProfile() {
  const requestSeq = ++profileRequestSeq;

  try {
    profileContainer.innerHTML = '<div class="activities-status">Checking session...</div>';
    const accessToken = await requireSessionToken();
    if (requestSeq !== profileRequestSeq) {
      return;
    }

    profileContainer.innerHTML = '<div class="activities-status">Loading profile...</div>';
    const user = await fetchProfileFromAuth0(accessToken);
    if (requestSeq !== profileRequestSeq) {
      return;
    }
    currentUser = user || null;

    profileContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
        <img
          src="${user?.picture || placeholderImage}"
          alt="${user?.name || 'User'}"
          class="profile-picture"
          style="width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 3px solid #63b3ed;"
          onerror="this.src='${placeholderImage}'"
        />
        <div style="text-align: center;">
          <div class="profile-email" style="font-size: 1.15rem; color: #a0aec0;">
            ${user?.email || 'No email provided'}
          </div>
        </div>
      </div>
    `;

    initializeActivitiesForUser(currentUser);
  } catch (err) {
    if (requestSeq !== profileRequestSeq) {
      return;
    }
    if (err?.message === 'SESSION_REQUIRED') {
      showLoggedOut();
      return;
    }

    console.error('Error displaying profile from API:', err);
    currentUser = null;
    profileContainer.innerHTML = `
      <div class="activities-status error">
        Failed to load profile from API.
      </div>
    `;
  }
}

async function requireSessionToken() {
  const authenticated = await auth0Client.isAuthenticated();
  if (!authenticated) {
    throw new Error('SESSION_REQUIRED');
  }

  try {
    return await auth0Client.getTokenSilently({
      authorizationParams: {
        scope: 'openid profile email'
      }
    });
  } catch (err) {
    console.warn('Session validation failed before profile request:', err);
    throw new Error('SESSION_REQUIRED');
  }
}

async function fetchProfileFromAuth0(accessToken) {
  const payload = await fetchJson('/api/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!payload?.ok || !payload?.user) {
    throw new Error('profile API returned invalid response');
  }

  return payload.user;
}

async function login() {
  try {
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: callbackUri,
        scope: 'openid profile email'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    showError(err.message);
  }
}

async function logout() {
  try {
    await auth0Client.logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  } catch (err) {
    console.error('Logout error:', err);
    showError(err.message);
  }
}

function hideLoading() {
  loading.style.display = 'none';
  app.style.display = 'flex';
}

function showError(message) {
  loading.style.display = 'none';
  app.style.display = 'none';
  error.style.display = 'block';
  errorDetails.textContent = message;
}

function showLoggedIn() {
  loggedOutSection.style.display = 'none';
  loggedInSection.style.display = 'flex';
  switchWorkspaceView('profile');
}

function showLoggedOut() {
  loggedInSection.style.display = 'none';
  loggedOutSection.style.display = 'flex';
  currentUser = null;
  resetActivitiesUI();
  resetSearchUI();
}

function resolveCallbackUri() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.origin}/auth/callback`;
  }

  return 'https://217.76.62.29/auth/callback';
}

function getActivityStorageKey(user) {
  const userId = user?.sub || user?.email || 'anonymous';
  return `sample0.activities.${userId}`;
}

function readActivities(user) {
  const key = getActivityStorageKey(user);
  const raw = localStorage.getItem(key);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActivities(user, activities) {
  localStorage.setItem(getActivityStorageKey(user), JSON.stringify(activities));
}

function seedActivitiesIfMissing(user) {
  const key = getActivityStorageKey(user);
  if (localStorage.getItem(key) !== null) {
    return;
  }

  const now = Date.now();
  writeActivities(user, [
    { id: `seed-${now}-1`, title: 'Review Auth0 profile claims', done: false },
    { id: `seed-${now}-2`, title: 'Test login and logout flow', done: false }
  ]);
}

function initializeActivitiesForUser(user) {
  if (!user) {
    resetActivitiesUI();
    return;
  }

  seedActivitiesIfMissing(user);
  renderActivities(readActivities(user));
  setActivityStatus('Sample data ready. Add your own tasks.', 'success');
}

function renderActivities(activities) {
  if (!activityList) {
    return;
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    activityList.innerHTML = '<li class="activities-empty">No activities yet.</li>';
    return;
  }

  activityList.innerHTML = activities
    .map((item) => `
      <li class="activities-item ${item.done ? 'done' : ''}">
        <span class="activities-item-title">${escapeHtml(item.title || 'Untitled')}</span>
        <div class="activities-item-actions">
          <button type="button" class="activity-action-btn" data-activity-action="toggle" data-activity-id="${escapeHtml(item.id)}">
            ${item.done ? 'Undo' : 'Done'}
          </button>
          <button type="button" class="activity-action-btn danger" data-activity-action="delete" data-activity-id="${escapeHtml(item.id)}">
            Delete
          </button>
        </div>
      </li>
    `)
    .join('');
}

function setActivityStatus(message, mode = 'neutral') {
  if (!activityStatus) {
    return;
  }

  activityStatus.textContent = message;
  activityStatus.className = `activities-status ${mode}`;
}

function resetActivitiesUI() {
  if (activityInput) {
    activityInput.value = '';
  }

  if (activityList) {
    activityList.innerHTML = '<li class="activities-empty">Sign in to manage activities.</li>';
  }

  setActivityStatus('', 'neutral');
}

async function handleActivitySubmit(event) {
  event.preventDefault();
  if (!currentUser || !activityInput) {
    return;
  }

  const title = activityInput.value.trim();
  if (!title) {
    setActivityStatus('Enter an activity title.', 'error');
    return;
  }

  if (activityAddBtn) {
    activityAddBtn.disabled = true;
  }

  try {
    const activities = readActivities(currentUser);
    activities.unshift({ id: `item-${Date.now()}`, title, done: false });
    writeActivities(currentUser, activities);
    renderActivities(activities);
    activityInput.value = '';
    setActivityStatus('Activity added.', 'success');
  } finally {
    if (activityAddBtn) {
      activityAddBtn.disabled = false;
    }
  }
}

function handleActivityListClick(event) {
  if (!currentUser) {
    return;
  }

  const actionBtn = event.target.closest('[data-activity-action]');
  if (!actionBtn) {
    return;
  }

  const action = actionBtn.getAttribute('data-activity-action');
  const id = actionBtn.getAttribute('data-activity-id');
  if (!action || !id) {
    return;
  }

  const activities = readActivities(currentUser);
  const index = activities.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }

  if (action === 'toggle') {
    activities[index].done = !activities[index].done;
    setActivityStatus('Activity updated.', 'success');
  } else if (action === 'delete') {
    activities.splice(index, 1);
    setActivityStatus('Activity removed.', 'success');
  } else {
    return;
  }

  writeActivities(currentUser, activities);
  renderActivities(activities);
}

function switchWorkspaceView(viewName = 'profile') {
  workspaceTabs.forEach((tab) => {
    const active = tab.dataset.workspaceView === viewName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  workspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.workspacePanel !== viewName;
  });

  if (viewName === 'profile' && loggedInSection?.style.display !== 'none') {
    displayProfile();
  }
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  if (!searchInput) {
    return;
  }

  const query = searchInput.value.trim();
  if (!query) {
    setSearchStatus('Type something to search.', 'error');
    return;
  }

  if (searchBtn) {
    searchBtn.disabled = true;
  }

  try {
    setSearchStatus('Searching server...', 'neutral');
    const payload = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
    renderSearchResults(payload);
    setSearchStatus('Search response received from server.', 'success');
  } catch (err) {
    setSearchStatus(err.message || 'Search request failed.', 'error');
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
    }
  }
}

function renderSearchResults(payload) {
  if (!searchResults) {
    return;
  }

  const items = Array.isArray(payload?.results) ? payload.results : [];
  if (items.length === 0) {
    searchResults.innerHTML = '<li class="activities-empty">No results from server.</li>';
    return;
  }

  searchResults.innerHTML = items
    .map((item) => `<li class="activities-item"><span class="activities-item-title">${escapeHtml(item)}</span></li>`)
    .join('');
}

function setSearchStatus(message, mode = 'neutral') {
  if (!searchStatus) {
    return;
  }

  searchStatus.textContent = message;
  searchStatus.className = `activities-status ${mode}`;
}

function resetSearchUI() {
  if (searchInput) {
    searchInput.value = '';
  }

  if (searchResults) {
    searchResults.innerHTML = '<li class="activities-empty">Search results will appear here.</li>';
  }

  setSearchStatus('', 'neutral');
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Server request failed (${response.status})`);
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);
activityForm?.addEventListener('submit', handleActivitySubmit);
activityList?.addEventListener('click', handleActivityListClick);
workspaceTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchWorkspaceView(tab.dataset.workspaceView));
});
searchForm?.addEventListener('submit', handleSearchSubmit);

resetSearchUI();
initAuth0();
