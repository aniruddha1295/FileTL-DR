/**
 * Static HTML page template for the live dashboard. Kept in its own module
 * (as a plain template string, no build step / no JSX) so `server.ts` stays
 * focused on the HTTP/SSE plumbing.
 *
 * The page polls `/state` every 1.5s (see rationale in server.ts) and renders
 * whatever it gets — band, runway numbers, PDP status, decision log, and any
 * executed action result. All rendering happens client-side with plain DOM
 * APIs; no framework, no external scripts (keeps this fully offline/self-contained
 * for the demo, no dependency on network access to a CDN).
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Filecoin Runway Triage — Live Dashboard</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0b0e14;
    color: #e6e6e6;
    padding: 24px;
  }
  h1 { font-size: 20px; margin: 0 0 20px; color: #fff; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .card {
    background: #161b26;
    border: 1px solid #2a3040;
    border-radius: 10px;
    padding: 16px 20px;
  }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #8a93a6; margin: 0 0 10px; }
  #band {
    font-size: 28px;
    font-weight: 700;
    padding: 14px 20px;
    border-radius: 10px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 24px;
    transition: background-color 0.3s ease;
  }
  .band-green { background: #10381f; color: #4ade80; border: 1px solid #1f7a3f; }
  .band-yellow { background: #3a3110; color: #facc15; border: 1px solid #8a6d1f; }
  .band-red { background: #3a1414; color: #f87171; border: 1px solid #8a2323; }
  .band-insufficient-data { background: #23283a; color: #a5b4fc; border: 1px solid #4048a0; }
  .stat { font-size: 22px; font-weight: 600; color: #fff; }
  .stat-label { font-size: 12px; color: #8a93a6; margin-top: 4px; }
  #pdpStatus {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 14px;
  }
  .pdp-verified { background: #10381f; color: #4ade80; }
  .pdp-verifying { background: #3a3110; color: #facc15; }
  .pdp-unverified { background: #3a1414; color: #f87171; }
  .pdp-unknown { background: #23283a; color: #a5b4fc; }
  #log {
    max-height: 420px;
    overflow-y: auto;
    display: flex;
    flex-direction: column-reverse;
  }
  .log-entry {
    border-left: 3px solid #444;
    padding: 8px 12px;
    margin-bottom: 10px;
    background: #10131c;
    border-radius: 0 6px 6px 0;
  }
  .log-entry.band-green { border-left-color: #4ade80; background: #0f1a13; color: inherit; }
  .log-entry.band-yellow { border-left-color: #facc15; background: #1a1710; color: inherit; }
  .log-entry.band-red { border-left-color: #f87171; background: #1a1010; color: inherit; }
  .log-entry.band-insufficient-data { border-left-color: #a5b4fc; background: #12131f; color: inherit; }
  .log-meta { font-size: 12px; color: #8a93a6; margin-bottom: 4px; }
  .log-action { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; margin-right: 8px; }
  .log-reason { font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
  .log-executed { margin-top: 6px; font-size: 13px; color: #93c5fd; font-family: ui-monospace, monospace; }
  #empty { color: #8a93a6; font-style: italic; }
</style>
</head>
<body>
  <h1>Filecoin Runway Triage Agent — Live Dashboard</h1>

  <div id="band" class="band-insufficient-data">Waiting for data…</div>

  <div class="grid">
    <div class="card">
      <h2>% of Baseline</h2>
      <div class="stat" id="percentOfBaseline">—</div>
    </div>
    <div class="card">
      <h2>Estimated Days Remaining</h2>
      <div class="stat" id="estimatedDaysRemaining">—</div>
    </div>
    <div class="card">
      <h2>Estimated Epochs Remaining</h2>
      <div class="stat" id="estimatedEpochsRemaining">—</div>
    </div>
    <div class="card">
      <h2>PDP Status</h2>
      <div><span id="pdpStatus" class="pdp-unknown">unknown</span></div>
    </div>
  </div>

  <div class="card">
    <h2>Decision Trace Log</h2>
    <div id="log"><div id="empty">No decisions yet.</div></div>
  </div>

<script>
(function () {
  var lastSeq = -1;

  function fmt(v) {
    return (v === null || v === undefined) ? '—' : String(v);
  }

  function bandClass(band) {
    return 'band-' + band;
  }

  function renderCurrent(state) {
    var bandEl = document.getElementById('band');
    if (state.band) {
      bandEl.className = bandClass(state.band);
      bandEl.textContent = state.band.replace(/-/g, ' ');
    } else {
      bandEl.className = 'band-insufficient-data';
      bandEl.textContent = 'Waiting for data…';
    }

    document.getElementById('percentOfBaseline').textContent =
      state.details && state.details.percentOfBaseline !== null && state.details.percentOfBaseline !== undefined
        ? state.details.percentOfBaseline.toFixed(1) + '%'
        : '—';
    document.getElementById('estimatedDaysRemaining').textContent =
      state.details && state.details.estimatedDaysRemaining !== null && state.details.estimatedDaysRemaining !== undefined
        ? state.details.estimatedDaysRemaining.toFixed(1) + ' days'
        : '—';
    document.getElementById('estimatedEpochsRemaining').textContent = fmt(state.details && state.details.estimatedEpochsRemaining);

    var pdpEl = document.getElementById('pdpStatus');
    var pdpStatus = state.pdpStatus && state.pdpStatus.status;
    pdpEl.textContent = pdpStatus || 'unknown';
    pdpEl.className = pdpStatus ? 'pdp-' + pdpStatus : 'pdp-unknown';
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
      var executedHtml = '';
      if (evt.executed) {
        executedHtml = '<div class="log-executed">' + escapeHtml(JSON.stringify(evt.executed)) + '</div>';
      }
      div.innerHTML =
        '<div class="log-meta">#' + evt.seq + ' &middot; ' + escapeHtml(new Date(evt.timestamp).toLocaleTimeString()) +
        ' &middot; band: ' + escapeHtml(evt.band) + '</div>' +
        '<span class="log-action">' + escapeHtml(evt.action) + '</span>' +
        '<div class="log-reason">' + escapeHtml(evt.reason) + '</div>' +
        executedHtml;
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
