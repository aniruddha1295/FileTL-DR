/**
 * Static HTML page template for the live dashboard. Kept in its own module
 * (as a plain template string, no build step / no JSX) so `server.ts` stays
 * focused on the HTTP/SSE plumbing.
 *
 * The page polls `/state` every 1.5s (see rationale in server.ts) and renders
 * whatever it gets — band, runway numbers, PDP status, decision log, and any
 * executed action result. All rendering happens client-side with plain DOM
 * APIs; no framework, no external scripts or fonts (keeps this fully
 * offline/self-contained for the demo — no CDN dependency, works inside the
 * zero-install Docker image with no network access needed).
 *
 * Icons are hand-written inline SVGs (stroke-based, 20x20, 2px stroke) —
 * no icon font, no emoji — so every status is conveyed by icon + color +
 * text together, never color alone.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Filecoin Runway Triage — Live Dashboard</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #05070c;
    --surface: #0d1119;
    --surface-2: #121828;
    --border: rgba(255,255,255,0.08);
    --border-strong: rgba(255,255,255,0.16);
    --text: #f1f5f9;
    --text-muted: #8b94a9;
    --text-faint: #5b6478;
    --accent: #38bdf8;
    --accent-dim: rgba(56,189,248,0.15);
    --green: #34d399;
    --green-bg: rgba(52,211,153,0.12);
    --green-border: rgba(52,211,153,0.35);
    --yellow: #fbbf24;
    --yellow-bg: rgba(251,191,36,0.12);
    --yellow-border: rgba(251,191,36,0.35);
    --red: #f87171;
    --red-bg: rgba(248,113,113,0.12);
    --red-border: rgba(248,113,113,0.35);
    --indigo: #a5b4fc;
    --indigo-bg: rgba(165,180,252,0.12);
    --indigo-border: rgba(165,180,252,0.35);
    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --font-mono: ui-monospace, 'SFMono-Regular', 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--font-sans);
    background: radial-gradient(1200px 600px at 15% -10%, rgba(56,189,248,0.07), transparent), var(--bg);
    color: var(--text);
    padding: 32px clamp(16px, 4vw, 48px) 48px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }

  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .title-block h1 { font-size: 19px; font-weight: 700; margin: 0 0 4px; color: #fff; letter-spacing: -0.01em; }
  .title-block p { margin: 0; font-size: 13px; color: var(--text-muted); }
  .live-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 6px 12px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border-strong);
    font-size: 12px; font-weight: 600; color: var(--text-muted);
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .live-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--green); box-shadow: 0 0 0 0 rgba(52,211,153,0.6); animation: pulse 2s infinite; flex-shrink: 0; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.5); }
    70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); }
    100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
  }

  .icon { width: 20px; height: 20px; flex-shrink: 0; }
  .icon-sm { width: 15px; height: 15px; flex-shrink: 0; }

  #bandCard {
    border-radius: 16px;
    padding: 22px 26px;
    margin-bottom: 20px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    transition: background-color 0.35s ease, border-color 0.35s ease;
  }
  #bandCard.band-green { background: linear-gradient(155deg, var(--green-bg), var(--surface) 60%); border-color: var(--green-border); }
  #bandCard.band-yellow { background: linear-gradient(155deg, var(--yellow-bg), var(--surface) 60%); border-color: var(--yellow-border); }
  #bandCard.band-red { background: linear-gradient(155deg, var(--red-bg), var(--surface) 60%); border-color: var(--red-border); }
  #bandCard.band-insufficient-data { background: linear-gradient(155deg, var(--indigo-bg), var(--surface) 60%); border-color: var(--indigo-border); }

  .band-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .band-top .icon { width: 26px; height: 26px; }
  #bandLabel { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; text-transform: uppercase; }
  .band-green #bandLabel, .band-green .band-icon { color: var(--green); }
  .band-yellow #bandLabel, .band-yellow .band-icon { color: var(--yellow); }
  .band-red #bandLabel, .band-red .band-icon { color: var(--red); }
  .band-insufficient-data #bandLabel, .band-insufficient-data .band-icon { color: var(--indigo); }
  #bandSub { font-size: 13px; color: var(--text-muted); margin-left: 4px; }

  .gauge-track { position: relative; height: 10px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: visible; margin-bottom: 8px; }
  .gauge-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 999px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1), background-color 0.35s ease; }
  .band-green .gauge-fill { background: var(--green); }
  .band-yellow .gauge-fill { background: var(--yellow); }
  .band-red .gauge-fill { background: var(--red); }
  .band-insufficient-data .gauge-fill { background: var(--indigo); }
  .gauge-tick { position: absolute; top: -3px; width: 2px; height: 16px; background: rgba(255,255,255,0.22); }
  .gauge-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); }
  .gauge-percent { font-family: var(--font-mono); font-size: 13px; color: var(--text-muted); }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 18px;
  }
  .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-faint); margin: 0 0 10px; font-weight: 600; }
  .stat { font-size: 21px; font-weight: 700; color: #fff; font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }

  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-weight: 700; font-size: 13px; border: 1px solid transparent; }
  .badge-verified { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
  .badge-verifying { background: var(--yellow-bg); color: var(--yellow); border-color: var(--yellow-border); }
  .badge-unverified { background: var(--red-bg); color: var(--red); border-color: var(--red-border); }
  .badge-unknown { background: var(--indigo-bg); color: var(--indigo); border-color: var(--indigo-border); }

  .action-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 700; }
  .action-none { color: var(--text-muted); }
  .action-top-up { color: var(--accent); }
  .action-drop-dataset { color: var(--red); }
  .action-hold-and-monitor { color: var(--yellow); }

  .section-title { display: flex; align-items: baseline; gap: 10px; margin: 28px 0 12px; }
  .section-title h2 { font-size: 14px; font-weight: 700; color: #fff; margin: 0; }
  .section-title p { font-size: 12px; color: var(--text-faint); margin: 0; font-family: var(--font-mono); }

  #log {
    max-height: 480px;
    overflow-y: auto;
    display: flex;
    flex-direction: column-reverse;
    gap: 10px;
    border-radius: 12px;
  }
  .log-entry {
    border: 1px solid var(--border);
    border-left-width: 3px;
    padding: 13px 16px;
    background: var(--surface);
    border-radius: 8px;
    animation: slideIn 0.4s cubic-bezier(0.22,1,0.36,1);
  }
  @media (prefers-reduced-motion: reduce) { .log-entry { animation: none; } .live-dot { animation: none; } .gauge-fill { transition: none; } }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .log-entry.band-green { border-left-color: var(--green); }
  .log-entry.band-yellow { border-left-color: var(--yellow); }
  .log-entry.band-red { border-left-color: var(--red); }
  .log-entry.band-insufficient-data { border-left-color: var(--indigo); }
  .log-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-faint); margin-bottom: 8px; font-family: var(--font-mono); }
  .log-meta .badge { padding: 2px 8px; font-size: 11px; }
  .log-reason { font-size: 14px; line-height: 1.55; color: var(--text); margin-bottom: 8px; }
  .log-executed {
    display: flex; align-items: center; gap: 8px;
    font-size: 12.5px; color: var(--text-muted);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; padding: 7px 10px; font-family: var(--font-mono);
  }
  .log-executed .tx { color: var(--accent); }
  #empty { color: var(--text-faint); font-style: italic; padding: 20px; text-align: center; }

  footer { margin-top: 32px; text-align: center; font-size: 12px; color: var(--text-faint); }
  footer a { color: var(--text-muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="title-block">
      <h1>Tiered Runway Triage Agent</h1>
      <p>Autonomous Filecoin storage-budget decisions &mdash; runway &times; PDP proof status</p>
    </div>
    <div class="live-pill"><span class="live-dot"></span> Live</div>
  </header>

  <div id="bandCard" class="band-insufficient-data">
    <div class="band-top">
      <span class="band-icon icon" id="bandIcon"></span>
      <span id="bandLabel">Waiting for data&hellip;</span>
      <span id="bandSub"></span>
    </div>
    <div class="gauge-track">
      <div class="gauge-tick" style="left: 30%"></div>
      <div class="gauge-tick" style="left: 70%"></div>
      <div class="gauge-fill" id="gaugeFill" style="width: 0%"></div>
    </div>
    <div class="gauge-labels">
      <span>0%</span>
      <span class="gauge-percent" id="gaugePercentLabel">&mdash;</span>
      <span>100%</span>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Est. Days Remaining</h2>
      <div class="stat" id="estimatedDaysRemaining">&mdash;</div>
    </div>
    <div class="card">
      <h2>Est. Epochs Remaining</h2>
      <div class="stat" id="estimatedEpochsRemaining">&mdash;</div>
    </div>
    <div class="card">
      <h2>PDP Proof Status</h2>
      <div><span id="pdpStatus" class="badge badge-unknown"></span></div>
    </div>
    <div class="card">
      <h2>Current Action</h2>
      <div class="action-badge action-none" id="actionBadge"><span>&mdash;</span></div>
    </div>
  </div>

  <div class="section-title">
    <h2>Decision Trace</h2>
    <p>band &rarr; forecast &rarr; PDP status &rarr; action &rarr; reason</p>
  </div>
  <div id="log" aria-live="polite"><div id="empty">No decisions yet.</div></div>

  <footer>Tiered Runway Triage Agent &middot; FilecoinTLDR Builder Challenge Cycle 4</footer>
</div>

<script>
(function () {
  var ICONS = {
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/></svg>',
    alert: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    help: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 114 2.1c-.7.5-1.5 1-1.5 2.2"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>',
    clock: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    minus: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    arrowUp: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5"/></svg>',
    trash: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0l-.8 12.1a2 2 0 01-2 1.9H8.8a2 2 0 01-2-1.9L6 7"/></svg>',
    pause: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>'
  };

  var BAND_ICON = { green: ICONS.check, yellow: ICONS.alert, red: ICONS.x, 'insufficient-data': ICONS.help };
  var BAND_TEXT = { green: 'Green &mdash; healthy runway', yellow: 'Yellow &mdash; runway tightening', red: 'Red &mdash; critical, deciding now', 'insufficient-data': 'Insufficient data &mdash; monitoring' };
  var PDP_ICON = { verified: ICONS.check, verifying: ICONS.clock, unverified: ICONS.x };
  var ACTION_ICON = { none: ICONS.minus, 'top-up': ICONS.arrowUp, 'drop-dataset': ICONS.trash, 'hold-and-monitor': ICONS.pause };
  var ACTION_TEXT = { none: 'Monitoring', 'top-up': 'Top-up proposed', 'drop-dataset': 'Dataset dropped', 'hold-and-monitor': 'Holding, re-checking' };

  function fmt(v) { return (v === null || v === undefined) ? '—' : String(v); }
  function bandClass(band) { return 'band-' + (band || 'insufficient-data'); }

  function renderCurrent(state) {
    var bandCard = document.getElementById('bandCard');
    var band = state.band || null;
    bandCard.className = bandClass(band);
    document.getElementById('bandIcon').innerHTML = BAND_ICON[band] || ICONS.help;
    document.getElementById('bandLabel').innerHTML = band ? (band.replace(/-/g, ' ')) : 'Waiting for data…';
    document.getElementById('bandSub').innerHTML = band ? BAND_TEXT[band] : '';

    var pct = state.details && typeof state.details.percentOfBaseline === 'number' ? state.details.percentOfBaseline : null;
    var gaugeFill = document.getElementById('gaugeFill');
    gaugeFill.style.width = (pct !== null ? Math.max(0, Math.min(100, pct)) : 0) + '%';
    document.getElementById('gaugePercentLabel').textContent = pct !== null ? pct.toFixed(1) + '% of baseline' : '—';

    document.getElementById('estimatedDaysRemaining').textContent =
      state.details && state.details.estimatedDaysRemaining !== null && state.details.estimatedDaysRemaining !== undefined
        ? state.details.estimatedDaysRemaining.toFixed(1) + ' days' : '— (infinite)';
    document.getElementById('estimatedEpochsRemaining').textContent = fmt(state.details && state.details.estimatedEpochsRemaining);

    var pdpEl = document.getElementById('pdpStatus');
    var pdpStatus = state.pdpStatus && state.pdpStatus.status;
    pdpEl.className = 'badge ' + (pdpStatus ? 'badge-' + pdpStatus : 'badge-unknown');
    pdpEl.innerHTML = (PDP_ICON[pdpStatus] || ICONS.help) + '<span>' + (pdpStatus || 'unknown') + '</span>';

    var actionEl = document.getElementById('actionBadge');
    var action = state.action || 'none';
    actionEl.className = 'action-badge action-' + action;
    actionEl.innerHTML = (ACTION_ICON[action] || ICONS.minus) + '<span>' + (ACTION_TEXT[action] || action) + '</span>';
  }

  function fmtExecuted(ex) {
    if (!ex) return '';
    if (ex.kind === 'top-up') {
      return ICONS.arrowUp + '<span>Executed top-up &middot; <span class="tx">' + escapeHtml(String(ex.amount)) + '</span> base units &middot; tx <span class="tx">' + escapeHtml(String(ex.txHash)) + '</span></span>';
    }
    if (ex.kind === 'drop-dataset') {
      return ICONS.trash + '<span>Executed drop &middot; data set <span class="tx">' + escapeHtml(String(ex.dataSetId)) + '</span> &middot; end epoch <span class="tx">' + escapeHtml(String(ex.endEpoch)) + '</span>' + (ex.txHash ? ' &middot; tx <span class="tx">' + escapeHtml(String(ex.txHash)) + '</span>' : '') + '</span>';
    }
    return ICONS.minus + '<span>No on-chain action taken</span>';
  }

  function renderLog(events) {
    var logEl = document.getElementById('log');
    if (!events.length) {
      logEl.innerHTML = '<div id="empty">No decisions yet.</div>';
      return;
    }
    logEl.innerHTML = '';
    events.forEach(function (evt) {
      var div = document.createElement('div');
      div.className = 'log-entry ' + bandClass(evt.band);
      div.innerHTML =
        '<div class="log-meta">' + ICONS.clock +
        ' #' + evt.seq + ' &middot; ' + escapeHtml(new Date(evt.timestamp).toLocaleTimeString()) +
        ' <span class="badge badge-' + (evt.band === 'red' ? 'unverified' : evt.band === 'green' ? 'verified' : evt.band === 'yellow' ? 'verifying' : 'unknown') + '">' + escapeHtml(evt.band) + '</span></div>' +
        '<div class="log-reason">' + escapeHtml(evt.reason) + '</div>' +
        '<div class="log-executed">' + fmtExecuted(evt.executed) + '</div>';
      logEl.appendChild(div);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function poll() {
    fetch('/state')
      .then(function (r) { return r.json(); })
      .then(function (state) {
        renderCurrent(state.current || {});
        renderLog(state.events || []);
      })
      .catch(function () { /* ignore transient poll failures */ })
      .then(function () {
        setTimeout(poll, 1500);
      });
  }

  poll();
})();
</script>
</body>
</html>`;
