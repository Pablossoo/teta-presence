// popup.js — reads state from chrome.storage and renders it

const STATUS_CONFIG = {
  success:      { dotClass: 'dot-success', label: '✅ Obecność potwierdzona' },
  already_done: { dotClass: 'dot-success', label: '✅ Już potwierdzona dzisiaj' },
  skipped:      { dotClass: 'dot-skipped', label: '⏭️ Dzień wolny — pominięto' },
  running:      { dotClass: 'dot-running', label: '⏳ Trwa potwierdzanie...' },
  error:        { dotClass: 'dot-error',   label: '❌ Błąd — ponawiam za 15 min' },
  not_logged_in:{ dotClass: 'dot-error',   label: '🔐 Brak sesji — zaloguj się do Teta' },
  idle:         { dotClass: 'dot-idle',    label: '💤 Oczekiwanie na sprawdzenie...' },
};

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

function renderStatus(data) {
  const status = data.status || 'idle';
  const cfg    = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  document.getElementById('statusDot').className   = `status-dot ${cfg.dotClass}`;
  document.getElementById('statusLabel').textContent = cfg.label;
  document.getElementById('statusDetail').textContent = data.statusDetail || '';
  document.getElementById('statusTime').textContent =
    data.statusTime ? `Ostatnia aktualizacja: ${formatTime(data.statusTime)}` : '';
}

function renderLogs(logs = []) {
  const list = document.getElementById('logList');
  if (!logs.length) {
    list.innerHTML = '<div class="empty">Brak wpisów</div>';
    return;
  }
  list.innerHTML = logs.slice(0, 20).map(entry => {
    const cls = entry.level === 'error' ? 'log-error'
              : entry.level === 'success' ? 'log-success'
              : '';
    const time = formatTime(entry.time);
    return `<div class="log-entry ${cls}">
      <span class="log-time">${time}</span>
      <span class="log-msg">${entry.message}</span>
    </div>`;
  }).join('');
}

function loadAndRender() {
  chrome.storage.local.get(['status', 'statusDetail', 'statusTime', 'successDate', 'logs'], data => {
    renderStatus(data);
    renderLogs(data.logs);
  });
}

// Initial load
loadAndRender();

// Refresh every 2 seconds while popup is open (status may change)
setInterval(loadAndRender, 2000);

// "Run Now" button
document.getElementById('runNowBtn').addEventListener('click', () => {
  const btn = document.getElementById('runNowBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Uruchamianie...';
  chrome.runtime.sendMessage({ type: 'RUN_NOW' });
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '▶ Uruchom teraz';
    loadAndRender();
  }, 5000);
});

// "Reset" button — clears successDate and status so the next run treats today as fresh
document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.remove(['successDate', 'statusDetail', 'statusTime', 'logs'], () => {
    chrome.storage.local.set({ status: 'idle' }, () => {
      loadAndRender();
    });
  });
});
