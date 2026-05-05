/**
 * storage.js — Google Drive sync (fixed token timing)
 * Saves data as TaskFlow/taskflow-data.json in the user's Google Drive
 * For team sync: share that file/folder with teammates via Google Drive
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'taskflow-data.json';
const FOLDER_NAME = 'TaskFlow';

let driveFileId = null;
let driveFolderId = null;
let syncTimer = null;
let workspaceData = null;
let driveReady = false; // true once folder/file lookup is done

// ===== Default data =====
function getDefaultData() {
  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const add = n => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
  return {
    version: 1,
    settings: { workspaceName: 'Team Workspace' },
    members: [
      { id: 'm1', name: 'Alice Chen', email: 'alice@company.com', role: 'admin' },
      { id: 'm2', name: 'Bob Kumar', email: 'bob@company.com', role: 'member' },
      { id: 'm3', name: 'Carol Smith', email: 'carol@company.com', role: 'member' },
      { id: 'm4', name: 'David Okonkwo', email: 'david@company.com', role: 'member' },
      { id: 'm5', name: 'Elena Rossi', email: 'elena@company.com', role: 'member' },
    ],
    projects: [
      { id: 'p1', name: 'Q2 Marketing', color: '#1967D2', horizon: 'short', desc: 'Q2 campaigns' },
      { id: 'p2', name: 'Product Roadmap', color: '#7B1FA2', horizon: 'long', desc: '12-month plan' },
      { id: 'p3', name: 'Client Onboarding', color: '#0F9D58', horizon: 'short', desc: 'New client setup' },
    ],
    tasks: [
      { id: 't1', title: 'Finalise campaign brief', desc: 'Sign off Q2 brief with stakeholders', project: 'p1', assignee: 'Alice Chen', priority: 'high', horizon: 'short', status: 'inprog', recur: 'none', start: add(-5), due: add(3), hours: 3, progress: 60, remarks: 'Needs CMO approval', created: fmt(today) },
      { id: 't2', title: 'Set up analytics dashboard', desc: 'GA4 and tracking setup', project: 'p1', assignee: 'Bob Kumar', priority: 'medium', horizon: 'short', status: 'todo', recur: 'none', start: add(1), due: add(8), hours: 5, progress: 0, remarks: '', created: fmt(today) },
      { id: 't3', title: 'Define 12-month milestones', desc: 'Map product milestones for annual plan', project: 'p2', assignee: 'Carol Smith', priority: 'high', horizon: 'long', status: 'todo', recur: 'none', start: add(2), due: add(20), hours: 8, progress: 0, remarks: 'Align with CEO doc', created: fmt(today) },
      { id: 't4', title: 'Weekly team standup', desc: '30 min sync every Monday', project: 'p3', assignee: 'David Okonkwo', priority: 'low', horizon: 'short', status: 'inprog', recur: 'weekly', start: add(-14), due: add(180), hours: 0.5, progress: 50, remarks: '', created: fmt(today) },
      { id: 't5', title: 'Onboarding doc update', desc: 'Update checklist to v2', project: 'p3', assignee: 'Elena Rossi', priority: 'medium', horizon: 'short', status: 'done', recur: 'none', start: add(-20), due: add(-3), hours: 2, progress: 100, remarks: 'v2 uploaded to Drive', created: fmt(today) },
      { id: 't6', title: 'Social media calendar', desc: 'Monthly content plan', project: 'p1', assignee: 'Bob Kumar', priority: 'high', horizon: 'short', status: 'todo', recur: 'monthly', start: add(-30), due: add(-5), hours: 4, progress: 0, remarks: 'Blocked — waiting on brand assets', created: fmt(today) },
    ],
  };
}

// ===== Load workspace =====
async function loadWorkspace() {
  setSyncStatus('saving');

  // Step 1: Always load from localStorage immediately so the UI isn't blank
  const local = localStorage.getItem('taskflow_data_v2');
  workspaceData = local ? JSON.parse(local) : getDefaultData();
  hideLoading();
  render();

  // Step 2: If signed in, wait for token then sync with Drive
  if (!isDemoMode) {
    setSyncStatus('saving');
    document.getElementById('loading-text').textContent = 'Syncing with Google Drive...';

    // Wait up to 8 seconds for the token to arrive
    let waited = 0;
    while (!googleAccessToken && waited < 8000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }

    if (!googleAccessToken) {
      console.warn('No token after waiting — staying on local data');
      setSyncStatus('error');
      showToast('Could not connect to Google Drive — working offline', 4000);
      return;
    }

    try {
      await ensureFolder();
      const driveData = await readFromDrive();
      if (driveData) {
        workspaceData = driveData;
        // Also update localStorage so next load is instant
        localStorage.setItem('taskflow_data_v2', JSON.stringify(workspaceData));
        render(); // Re-render with Drive data
      } else {
        // First time — no Drive file yet, save current data to Drive
        await writeToDrive(workspaceData);
      }
      driveReady = true;
      setSyncStatus('ok');
      showToast('Synced with Google Drive ✓');
    } catch (e) {
      console.error('Drive load error:', e);
      setSyncStatus('error');
      showToast('Drive sync failed — tasks saved locally only', 4000);
    }
  } else {
    setSyncStatus('ok');
  }
}

// ===== Google Drive operations =====
async function ensureFolder() {
  // Check if TaskFlow folder exists
  const res = await driveRequest(`${DRIVE_API}/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`);
  if (res.files && res.files.length > 0) {
    driveFolderId = res.files[0].id;
  } else {
    // Create folder
    const created = await driveRequest(`${DRIVE_API}/files`, 'POST', {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    });
    driveFolderId = created.id;
  }
  // Find data file in folder
  const fres = await driveRequest(`${DRIVE_API}/files?q=name='${FILE_NAME}' and '${driveFolderId}' in parents and trashed=false&fields=files(id,name)`);
  if (fres.files && fres.files.length > 0) {
    driveFileId = fres.files[0].id;
  }
}

async function readFromDrive() {
  if (!driveFileId) return null;
  const res = await fetch(`${DRIVE_API}/files/${driveFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${googleAccessToken}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function writeToDrive(data) {
  const body = JSON.stringify(data, null, 2);
  if (!driveFileId) {
    // Create new file
    const meta = { name: FILE_NAME, parents: [driveFolderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('media', new Blob([body], { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      body: form,
    });
    const created = await res.json();
    driveFileId = created.id;
  } else {
    // Update existing
    await fetch(`${UPLOAD_API}/files/${driveFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
      body,
    });
  }
}

async function driveRequest(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return await res.json();
}

// ===== Sync =====
function scheduleSync() {
  setSyncStatus('saving');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(doSync, 1500);
}

async function doSync() {
  if (!workspaceData) return;

  // Always save to localStorage as instant fallback
  try { localStorage.setItem('taskflow_data_v2', JSON.stringify(workspaceData)); } catch(e) {}

  if (isDemoMode) { setSyncStatus('ok'); return; }

  // If no token yet, retry in 5 seconds
  if (!googleAccessToken) {
    setSyncStatus('error');
    setTimeout(doSync, 5000);
    return;
  }

  try {
    // If Drive folder not set up yet, do it now
    if (!driveReady || !driveFolderId) {
      await ensureFolder();
      driveReady = true;
    }
    await writeToDrive(workspaceData);
    setSyncStatus('ok');
  } catch (e) {
    console.error('Sync error:', e);
    setSyncStatus('error');
    showToast('Sync failed — saved locally. Retrying...', 3000);
    setTimeout(doSync, 15000);
  }
}

function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-badge sync-' + state;
  const labels = { idle: 'Up to date', saving: 'Saving to Drive...', ok: 'Saved to Google Drive ✓', error: 'Sync error — saved locally' };
  el.title = labels[state] || '';
}

function getData() { return workspaceData; }

function mutate(fn) {
  fn(workspaceData);
  scheduleSync();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
