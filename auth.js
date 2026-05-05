/**
 * auth.js — Google Sign-In via Google Identity Services
 *
 * SETUP (5 mins, free):
 * 1. Go to https://console.cloud.google.com
 * 2. Create a new project (or use existing)
 * 3. APIs & Services → OAuth consent screen → External → fill in app name "TaskFlow"
 * 4. APIs & Services → Credentials → Create → OAuth 2.0 Client ID
 *    → Application type: Web application
 *    → Authorised JavaScript origins: https://your-vercel-url.vercel.app (and http://localhost:8080 for testing)
 * 5. Copy the Client ID and paste below
 * 6. APIs & Services → Enable APIs → search "Google Drive API" → Enable
 */

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // ← paste here

const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';

let currentUser = null;
let googleAccessToken = null;
let isDemoMode = false;
let gapiReady = false;
let tokenClient = null;

// Called when google api.js loads
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({});
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    gapiReady = true;
  });
}

// Google Identity Services callback
function handleGoogleSignIn(response) {
  if (!response.credential) return;
  const payload = parseJwt(response.credential);
  currentUser = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
    id: payload.sub,
  };
  requestDriveAccess();
}

function signInWithGoogle() {
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    showToast('Google Client ID not set — using demo mode. See js/auth.js for setup.', 5000);
    useDemoMode();
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: async (tokenResponse) => {
      if (tokenResponse.error) { console.error(tokenResponse); return; }
      googleAccessToken = tokenResponse.access_token;
      gapi.client.setToken({ access_token: googleAccessToken });
      // Fetch user info if not already available
      if (!currentUser) {
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${googleAccessToken}` }
          });
          const info = await res.json();
          currentUser = { name: info.name, email: info.email, picture: info.picture, id: info.sub };
        } catch(e) { currentUser = { name: 'User', email: '', picture: '', id: 'u1' }; }
      }
      onSignedIn();
    },
  });
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function requestDriveAccess() {
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    useDemoMode(); return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('Token error:', tokenResponse);
        showToast('Could not get Drive access. Please try signing in again.', 4000);
        return;
      }
      // Set token FIRST before anything else
      googleAccessToken = tokenResponse.access_token;
      if (typeof gapi !== 'undefined' && gapi.client) {
        gapi.client.setToken({ access_token: googleAccessToken });
      }
      console.log('Drive token acquired ✓');
      onSignedIn();
    },
  });
  tokenClient.requestAccessToken({ prompt: '' });
}

function useDemoMode() {
  isDemoMode = true;
  currentUser = { name: 'Demo User', email: 'demo@company.com', picture: '', id: 'demo' };
  onSignedIn();
}

async function onSignedIn() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  showLoading('Loading your workspace...');

  const name = currentUser.name || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const pic = currentUser.picture
    ? `<img src="${currentUser.picture}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0">`
    : `<div class="user-avatar">${initials}</div>`;

  document.getElementById('user-info').innerHTML = `
    ${pic}
    <div style="overflow:hidden">
      <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
      <div style="font-size:10px;color:#999">${isDemoMode ? 'Demo mode' : 'Admin'}</div>
    </div>`;

  await loadWorkspace();
}

function signOut() {
  if (!isDemoMode && typeof google !== 'undefined' && googleAccessToken) {
    google.accounts.oauth2.revoke(googleAccessToken);
  }
  currentUser = null; googleAccessToken = null; isDemoMode = false;
  driveFileId = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
}
