// background.js — service worker: scheduler, tab management, state

const TETA_URL      = 'https://lm.me5.pub.unit4bs.pl/Home';
const ALARM_NAME    = 'teta-presence-check';
const INTERVAL_MIN  = 15;
const START_HOUR    = 8;   // 08:00
const END_HOUR      = 17;  // 17:00

// ---------------------------------------------------------------------------
// Alarm setup — register on install and on service worker startup
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  log('info', 'Extension installed. Alarm scheduled.');
  tryPresence(); // immediate attempt on install
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  log('info', 'Browser started. Alarm scheduled.');
  tryPresence(); // immediate attempt on browser startup
});

function scheduleAlarm() {
  chrome.alarms.get(ALARM_NAME, existing => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,          // first check 1 min after startup
        periodInMinutes: INTERVAL_MIN
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Alarm handler
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM_NAME) return;
  tryPresence();
});

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------
let isRunning = false; // guard against concurrent runs

async function tryPresence(manualTrigger = false) {
  if (isRunning) {
    log('info', 'Już trwa sprawdzanie — pomijam.');
    return;
  }

  const now   = new Date();
  const hour  = now.getHours();
  const today = toDateKey(now);

  // New day reset: if successDate is from a past day, reset status so the icon updates
  const { successDate, status } = await storageGet(['successDate', 'status']);
  if (successDate && successDate !== today && (status === 'success' || status === 'already_done')) {
    await setStatus('idle');
  }

  // Outside working hours — skip silently (unless manually triggered)
  if (!manualTrigger && (hour < START_HOUR || hour >= END_HOUR)) {
    return;
  }

  // Already succeeded today
  const { successDate: savedSuccessDate } = await storageGet(['successDate']);
  if (savedSuccessDate === today) {
    log('info', 'Obecność już została potwierdzona dzisiaj.');
    await setStatus('already_done');
    return;
  }

  isRunning = true;
  log('info', `Próba potwierdzenia obecności o ${now.toLocaleTimeString()}...`);
  await setStatus('running');

  let tab;
  try {
    tab = await openOrFocusTetaTab();

    // Detect redirect to OAuth/login page — session not active
    if (tab && !tab.url.startsWith('https://lm.me5.pub.unit4bs.pl')) {
      log('error', 'Brak sesji — zaloguj się do Teta w Chrome i spróbuj ponownie.');
      await setStatus('not_logged_in');
      safeCloseTab(tab.id);
      isRunning = false;
      return;
    }

    await sleep(3000); // give the page time to settle after navigation

    // Inject and run the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content.js']
    });

    // isRunning is cleared in the FLOW_RESULT message handler

  } catch (err) {
    // Surface a friendly message for auth redirect / injection errors
    const isAuthError = err.message && (
      err.message.includes('idpb2e.adeo.com') ||
      err.message.includes('Cannot access contents')
    );
    if (isAuthError) {
      log('error', 'Brak sesji — zaloguj się do Teta w Chrome i spróbuj ponownie.');
      await setStatus('not_logged_in');
    } else {
      log('error', `Błąd: ${err.message}`);
      await setStatus('error', err.message);
    }
    if (tab) safeCloseTab(tab.id);
    isRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Listen for result from content script
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'FLOW_RESULT') return;

  const today = toDateKey(new Date());
  isRunning = false;

  if (msg.status === 'success') {
    log('success', '✅ Obecność potwierdzona pomyślnie!');
    storageSet({ successDate: today });
    setStatus('success');
    safeCloseTab(sender.tab.id);

  } else if (msg.status === 'already_submitted') {
    log('info', '✅ Obecność była już wcześniej potwierdzona w Teta.');
    storageSet({ successDate: today }); // don't retry today
    setStatus('already_done');
    safeCloseTab(sender.tab.id);

  } else if (msg.status === 'skipped') {
    log('info', '⏭️ Dzień wolny — obecność pominięta.');
    storageSet({ successDate: today });
    setStatus('skipped', msg.reason);
    safeCloseTab(sender.tab.id);

  } else {
    log('error', `❌ Błąd: ${msg.reason}`);
    setStatus('error', msg.reason);
    safeCloseTab(sender.tab.id);
    // Will retry automatically on next alarm (15 min)
  }
});

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------
async function openOrFocusTetaTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: 'https://lm.me5.pub.unit4bs.pl/*' }, tabs => {
      if (tabs.length > 0) {
        // Reuse existing tab and reload to get fresh state
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: false, url: TETA_URL }, updatedTab => {
          waitForTabLoad(updatedTab ? updatedTab.id : tab.id).then(resolve).catch(reject);
        });
      } else {
        // Open new background tab
        chrome.tabs.create({ url: TETA_URL, active: false }, newTab => {
          waitForTabLoad(newTab.id).then(resolve).catch(reject);
        });
      }
    });
  });
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function onUpdated(id, changeInfo, tab) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      } else if (Date.now() > deadline) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Tab load timeout'));
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Also check if already loaded
    chrome.tabs.get(tabId, tab => {
      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      }
    });
  });
}

function safeCloseTab(tabId) {
  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      // Tab already closed — ignore
    }
  });
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// ---------------------------------------------------------------------------
// Status & logging
// ---------------------------------------------------------------------------
async function setStatus(status, detail = '') {
  const now = new Date().toISOString();
  await storageSet({ status, statusDetail: detail, statusTime: now });
}

async function log(level, message) {
  const now     = new Date().toISOString();
  const entry   = { level, message, time: now };
  const { logs = [] } = await storageGet(['logs']);
  logs.unshift(entry);           // newest first
  if (logs.length > 100) logs.length = 100;  // keep last 100 entries
  await storageSet({ logs });
  console[level === 'error' ? 'error' : 'log'](`[Teta] ${message}`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Icon management
// ---------------------------------------------------------------------------
function updateIcon(status) {
  log('info', `Updating icon for status: ${status}`);
  
  if (status === 'success' || status === 'already_done') {
    // Green checkmark
    const imageData = generateIcon('#28a745', 'check');
    chrome.action.setIcon({ imageData: { "48": imageData, "128": imageData } });
    
  } else if (status === 'not_logged_in' || status === 'error') {
    // Red cross
    const imageData = generateIcon('#dc3545', 'cross');
    chrome.action.setIcon({ imageData: { "48": imageData, "128": imageData } });
    
  } else if (status === 'running' || status === 'idle') {
    // Neutral waiting icon (e.g., orange circle with a clock)
    const imageData = generateIcon('#fd7e14', 'clock');
    chrome.action.setIcon({ imageData: { "48": imageData, "128": imageData } });

  } else {
    // Reset to default
    chrome.action.setIcon({
      path: { "48": "icons/icon48.png", "128": "icons/icon128.png" }
    });
  }
}

function generateIcon(color, type) {
  const canvas = new OffscreenCanvas(48, 48);
  const ctx = canvas.getContext('2d');
  
  // Background circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(24, 24, 22, 0, 2 * Math.PI);
  ctx.fill();
  
  // Large "T"
  ctx.fillStyle = 'white';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', 24, 25);
  
  // Larger badge indicator on the bottom right
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(38, 38, 8, 0, 2 * Math.PI);
  ctx.fill();
  
  // Symbol inside the badge
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  if (type === 'check') {
    ctx.moveTo(34, 38);
    ctx.lineTo(36, 40);
    ctx.lineTo(42, 34);
  } else if (type === 'cross') {
    ctx.moveTo(35, 35);
    ctx.lineTo(41, 41);
    ctx.moveTo(41, 35);
    ctx.lineTo(35, 41);
  } else if (type === 'clock') {
    // Clock symbol
    ctx.arc(38, 38, 5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.moveTo(38, 38);
    ctx.lineTo(38, 35);
    ctx.moveTo(38, 38);
    ctx.lineTo(40, 38);
  }
  ctx.stroke();
  
  return ctx.getImageData(0, 0, 48, 48);
}

// Listen for status changes to update the icon
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.status) {
    updateIcon(changes.status.newValue);
  }
});

// Set initial icon on startup
chrome.storage.local.get(['status'], data => {
  updateIcon(data.status);
});

// ---------------------------------------------------------------------------
// Handle manual "Run Now" trigger from popup
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RUN_NOW') {
    tryPresence(true); // manualTrigger=true bypasses time-window check
  }
});
