// content.js — injected into Teta page to perform the full presence click flow

const WAIT_AFTER_CLICK = 3500;  // ms to wait after each click for page to load
const POLL_INTERVAL    = 400;   // ms between element polls
const POLL_TIMEOUT     = 25000; // ms max wait for an element

// GUID of the "Mój czas pracy" plugin — used in the schedule API URL.
// Visible in the nav href: /4F883A9E-89FF-4CF2-B284-D632BE81E1E4
const SCHEDULE_PLUGIN_GUID = '4F883A9E-89FF-4CF2-B284-D632BE81E1E4';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Element finders
// ---------------------------------------------------------------------------

function waitForElement(selector, timeoutMs = POLL_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() > deadline) return reject(new Error(`Timeout waiting for: ${selector}`));
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
}

// Find element by partial text match among a set of tag types (leaf nodes preferred).
// (kept as utility for potential future use)
function findByText(text, tags = 'a, button, li, span, div') {
  const lc = text.toLowerCase();
  return [...document.querySelectorAll(tags)].find(
    el => el.textContent.trim().toLowerCase().includes(lc)
  ) || null;
}

// ---------------------------------------------------------------------------
// Step 1: Check today's day type via Teta API (uses existing Chrome session)
// Returns: 'working' | 'off'
// ---------------------------------------------------------------------------
async function checkTodayViaApi() {
  const now       = new Date();
  const year      = now.getFullYear();
  const month     = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay   = new Date(year, now.getMonth() + 1, 0).getDate();
  const dateFrom  = `${year}-${month}-01T00:00:00.000`;
  const dateTo    = `${year}-${month}-${lastDay}T23:59:59.999`;

  const url = `https://lm.me5.pub.unit4bs.pl/api/{${SCHEDULE_PLUGIN_GUID}}/WorkSchedules`
            + `?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&loadBaseSchedule=true`;

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`API returned ${response.status}`);

  const data = await response.json();
  const schedules = data?.Ui5Result?.[0]?.ScheduleApprovedWorktimes ?? [];

  const todayStr = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

  const todayEntry = schedules.find(s => s.DayDate.startsWith(todayStr));
  if (!todayEntry) return 'off'; // No entry = non-working day

  // Only 'WorkTimePlanned' means a real working day
  return todayEntry.DayTypeCode === 'WorkTimePlanned' ? 'working' : 'off';
}

// ---------------------------------------------------------------------------
// Step 2: Click "Moje zgłoszenia" in the left navbar
// Primary: aria-label (stable). Fallback: data-u4id attribute.
// ---------------------------------------------------------------------------
async function clickMojeZgloszenia() {
  const el = await waitForElement(
    'a[aria-label="Moje zgłoszenia Przejdź do strony"], a[data-u4id="group3Plugin4"]'
  );
  el.click();
  await sleep(WAIT_AFTER_CLICK);
}

// ---------------------------------------------------------------------------
// Step 3: Click the "+" button (contains SVG icon #plus)
// The SVG <use> has xlink:href ending in #plus — find its ancestor button/a.
// ---------------------------------------------------------------------------
async function clickPlusButton() {
  const btn = await new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT;
    const check = () => {
      // Find the SVG use element referencing the plus icon
      const useEl = [...document.querySelectorAll('use')].find(u =>
        (u.getAttribute('xlink:href') || u.getAttribute('href') || '').endsWith('#plus')
      );
      if (useEl) {
        // Walk up to the nearest clickable ancestor (button or a)
        const clickable = useEl.closest('button, a, [role="button"]');
        if (clickable) return resolve(clickable);
      }
      if (Date.now() > deadline) return reject(new Error('Timeout waiting for "+" button'));
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
  btn.click();
  await sleep(WAIT_AFTER_CLICK);
}

// ---------------------------------------------------------------------------
// Step 4: Click "Potwierdzenie obecności" from the menu/list
// The span contains the exact text — click it or its clickable parent.
// ---------------------------------------------------------------------------
async function clickPotwierdzenie() {
  const el = await new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT;
    const check = () => {
      const spans = [...document.querySelectorAll('span, li, a, button')];
      const match = spans.find(s => s.textContent.trim() === 'Potwierdzenie obecności');
      if (match) {
        const clickable = match.closest('button, a, li, [role="menuitem"], [role="option"]') || match;
        return resolve(clickable);
      }
      if (Date.now() > deadline) return reject(new Error('Timeout waiting for "Potwierdzenie obecności"'));
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
  el.click();
  await sleep(WAIT_AFTER_CLICK);
}

// ---------------------------------------------------------------------------
// Step 5: Click "Prześlij" and verify no validation error appears
// ---------------------------------------------------------------------------
async function clickPrzeslij() {
  const el = await new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT;
    const check = () => {
      const label = [...document.querySelectorAll('span.ui5-button-label')].find(
        s => s.textContent.trim() === 'Prześlij'
      );
      if (label) {
        const btn = label.closest('button, [role="button"]') || label;
        return resolve(btn);
      }
      if (Date.now() > deadline) return reject(new Error('Timeout waiting for "Prześlij" button'));
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
  el.click();
  await sleep(WAIT_AFTER_CLICK);

  // Check if Teta shows any validation alert — on this form it always means
  // presence or another work event is already set for today.
  const alert = document.querySelector('.alert-danger, .validation-alert, [class*="alert"]');
  if (alert && alert.textContent.trim().length > 0) {
    throw new Error('already_submitted');
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------
async function runPresenceFlow() {
  try {
    // Step 1 — API check (no UI navigation needed)
    const dayType = await checkTodayViaApi();
    if (dayType === 'off') {
      return { status: 'skipped', reason: 'day_off' };
    }

    // Step 2 — navigate to Moje zgłoszenia
    await clickMojeZgloszenia();

    // Step 3 — click "+"
    await clickPlusButton();

    // Step 4 — select "Potwierdzenie obecności"
    await clickPotwierdzenie();

    // Step 5 — submit
    await clickPrzeslij();

    return { status: 'success' };

  } catch (err) {
    // Teta told us presence is already submitted for today
    if (err.message === 'already_submitted') {
      return { status: 'already_submitted' };
    }
    return { status: 'error', reason: err.message };
  }
}

// Run and send result back to background script
runPresenceFlow().then(result => {
  chrome.runtime.sendMessage({ type: 'FLOW_RESULT', ...result });
});
