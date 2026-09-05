/**
 * HTML page templates for the live dashboard. Kept in their own module (as
 * plain template strings, no build step / no JSX) so `server.ts` stays
 * focused on the HTTP plumbing.
 *
 * Two pages, two exports:
 * - DASHBOARD_HTML (served at "/") — the control panel: band/gauge/PDP/
 *   action status, the 4 scenario buttons, and a link to the trace page.
 * - TRACE_HTML (served at "/trace") — a dedicated, redesigned timeline view
 *   of the decision log. Navigating there is a real page load (no SPA
 *   router), by explicit choice: simplest to build, and it's a pure viewer
 *   page with no controls of its own, so there's nothing time-sensitive
 *   lost by leaving the control panel to look at it.
 *
 * Both pages poll `/state` every 1.5s and render client-side with plain DOM
 * APIs; no framework, no external scripts or fonts (keeps this fully
 * offline/self-contained — no CDN dependency, works inside the zero-install
 * Docker image with no network access needed). Icons are hand-written
 * inline SVGs (stroke-based) — no icon font, no emoji — so every status is
 * conveyed by icon + color + text together, never color alone.
 *
 * IMPORTANT for future edits: every element id/class queried by
 * DASHBOARD_HTML's <script> (bandCard, bandIcon, bandLabel, bandSub,
 * gaugeFill, gaugePercentLabel, estimatedDaysRemaining,
 * estimatedEpochsRemaining, pdpStatus, actionBadge, controlsRow, verifyIcon,
 * pdpPillIcon, walletPill*, .btn/data-scenario/.btn-icon) and
 * TRACE_HTML's <script> (log, logCount, walletPill*) is
 * load-bearing — restyle freely, keep those hooks intact or the JS (and
 * tests/ui.test.ts / tests/run-live-demo.test.ts) will break.
 */

const SHARED_HEAD_STYLE = `
  :root {
    color-scheme: dark;
    --page-bg: #08080c;
    --shell-bg: #0c0c11;
    --surface: #17171f;
    --surface-2: #1e1e28;
    --border: rgba(255,255,255,0.07);
    --border-strong: rgba(255,255,255,0.14);
    --text: #eceef3;
    --text-muted: #9599ab;
    --text-faint: #5c6075;
    --accent: #8b7cf6;
    --accent-bg: rgba(139,124,246,0.14);
    --accent-border: rgba(139,124,246,0.38);
    --green: #6fcf97;
    --green-bg: rgba(111,207,151,0.12);
    --green-border: rgba(111,207,151,0.32);
    --yellow: #e0b357;
    --yellow-bg: rgba(224,179,87,0.12);
    --yellow-border: rgba(224,179,87,0.32);
    --red: #ea6f6f;
    --red-bg: rgba(234,111,111,0.12);
    --red-border: rgba(234,111,111,0.32);
    --indigo: #9d95d8;
    --indigo-bg: rgba(157,149,216,0.12);
    --indigo-border: rgba(157,149,216,0.32);
    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --font-mono: ui-monospace, 'SFMono-Regular', 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: var(--font-sans);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(900px 560px at 8% -8%, rgba(139,124,246,0.24), transparent 60%),
      radial-gradient(900px 640px at 96% 108%, rgba(63,190,201,0.16), transparent 60%),
      var(--page-bg);
    padding: clamp(20px, 4vw, 56px) clamp(14px, 3vw, 28px);
    min-height: 100vh;
  }
  .shell {
    max-width: 1180px;
    margin: 0 auto;
    background: var(--shell-bg);
    border: 1px solid var(--border-strong);
    border-radius: 24px;
    padding: clamp(20px, 3vw, 32px) clamp(20px, 3.5vw, 36px) 30px;
    box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6);
  }
  .topnav { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .brand-mark { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(155deg, var(--accent), #3fbec9); flex-shrink: 0; }
  .brand-name { font-size: 14.5px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
  .status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 13px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border-strong);
    font-size: 11.5px; font-weight: 600; color: var(--text-muted);
    letter-spacing: 0.03em; white-space: nowrap;
  }
  .live-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--green); box-shadow: 0 0 0 0 rgba(111,207,151,0.5); animation: pulse 2s infinite; flex-shrink: 0; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(111,207,151,0.45); }
    70% { box-shadow: 0 0 0 6px rgba(111,207,151,0); }
    100% { box-shadow: 0 0 0 0 rgba(111,207,151,0); }
  }
  .pdp-pill { background: var(--accent-bg); border-color: var(--accent-border); color: var(--text); }
  .pdp-pill .icon-sm { color: var(--accent); }
  a.pill { text-decoration: none; cursor: pointer; }
  a.pill:hover { color: var(--text); border-color: var(--accent-border); text-decoration: underline; text-underline-offset: 3px; }
  a.pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .icon { width: 20px; height: 20px; flex-shrink: 0; }
  .icon-sm { width: 14px; height: 14px; flex-shrink: 0; }
  footer { margin-top: 24px; text-align: center; font-size: 11.5px; color: var(--text-faint); }
  @media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
`;

const SHARED_SCRIPT_PRELUDE = `
  var ICONS = {
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/></svg>',
    alert: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    help: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 114 2.1c-.7.5-1.5 1-1.5 2.2"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>',
    clock: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    minus: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    arrowUp: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5"/></svg>',
    trash: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0l-.8 12.1a2 2 0 01-2 1.9H8.8a2 2 0 01-2-1.9L6 7"/></svg>',
    pause: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>',
    play: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none"/></svg>',
    spinner: '<svg class="icon-sm spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 019 9"/></svg>',
    checkSeal: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 1.6 2.8-.3 1.1 2.6 2.6 1.1-.3 2.8L22 12l-1.4 2.2.3 2.8-2.6 1.1-1.1 2.6-2.8-.3L12 22l-2.4-1.6-2.8.3-1.1-2.6-2.6-1.1.3-2.8L2 12l1.4-2.2-.3-2.8 2.6-1.1 1.1-2.6 2.8.3z"/><path d="M8.5 12.2l2.3 2.3 4.7-4.9"/></svg>',
    externalLink: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6"/><path d="M14 4h6v6"/><path d="M10 14L20 4"/></svg>'
  };

  var FILFOX_ADDRESS_BASE = 'https://calibration.filfox.info/en/address/';
  var FILFOX_MESSAGE_BASE = 'https://calibration.filfox.info/en/message/';

  // Placeholder tx hashes used by the console-only executors (see
  // src/demo/run-live-demo.ts and src/demo/run-drain-cli.ts) — these never
  // correspond to a real on-chain transaction, so they must never render as
  // a clickable explorer link.
  var PLACEHOLDER_TX_HASHES = { '0xTOPUP': true, '0xDROP': true };

  function isRealTxHash(tx) {
    if (!tx) return false;
    var s = String(tx);
    if (PLACEHOLDER_TX_HASHES[s]) return false;
    if (/^0x0+$/.test(s)) return false;
    return true;
  }

  function shortAddr(addr) {
    return addr.length > 14 ? (addr.slice(0, 6) + '…' + addr.slice(-5)) : addr;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bandClass(band) { return 'band-' + (band || 'insufficient-data'); }

  // Human-facing labels for internal state values — these enum-style
  // strings (band/PDP status) drive CSS classes and decision logic
  // elsewhere, but must never be shown to a reader verbatim.
  var BAND_LABEL = { green: 'Healthy', yellow: 'Attention', red: 'Critical', 'insufficient-data': 'Gathering data' };
  var PDP_LABEL = { verified: 'Verified', verifying: 'Pending', unverified: 'Not verified' };

  function bandLabel(band) { return BAND_LABEL[band] || 'Gathering data'; }
  function pdpLabel(status) { return PDP_LABEL[status] || 'Unknown'; }

  function renderMeta(meta) {
    var walletPill = document.getElementById('walletPill');
    if (!walletPill) return;
    var addr = meta && meta.walletAddress;
    if (addr) {
      walletPill.href = FILFOX_ADDRESS_BASE + encodeURIComponent(addr);
      document.getElementById('walletPillLabel').textContent = shortAddr(addr);
      document.getElementById('walletPillIcon').innerHTML = ICONS.externalLink;
      walletPill.hidden = false;
    } else {
      walletPill.hidden = true;
    }
  }
`;

const TOPNAV_HTML = (extraStatus: string) => `
  <div class="topnav">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">Filecoin Triage</span>
    </div>
    <div class="status-row">
      <div class="pill"><span class="live-dot"></span> Live</div>
      <div class="pill pdp-pill"><span id="pdpPillIcon" class="icon-sm"></span><span>PDP: Proof of Data Possession</span></div>
      <a class="pill" id="walletPill" href="#" target="_blank" rel="noopener" hidden>
        <span id="walletPillIcon" class="icon-sm"></span><span id="walletPillLabel"></span>
      </a>
      ${extraStatus}
    </div>
  </div>
`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Filecoin Runway Triage — Live Dashboard</title>
<style>
${SHARED_HEAD_STYLE}
  .verify-strip {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 11px 16px; margin-bottom: 20px;
    font-size: 12.5px; line-height: 1.5; color: var(--text-muted);
  }
  .verify-strip .icon-sm { color: var(--accent); flex-shrink: 0; }
  .verify-strip strong { font-weight: 700; color: var(--text); }

  .hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 18px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 8px; }
  .hero h1 { font-size: clamp(24px, 3vw, 32px); font-weight: 700; margin: 0 0 8px; color: var(--text); letter-spacing: -0.015em; }
  .hero-sub { margin: 0; font-size: 13.5px; color: var(--text-muted); max-width: 46ch; }
  .hero-stat { text-align: right; }
  .hero-stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 6px; }
  .hero-number-row { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
  #gaugePercentLabel { font-family: var(--font-mono); font-size: clamp(26px, 3.4vw, 34px); font-weight: 700; color: var(--text); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .band-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 12.5px;
    text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid transparent;
  }
  #bandCard.band-green .band-pill { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
  #bandCard.band-yellow .band-pill { background: var(--yellow-bg); color: var(--yellow); border-color: var(--yellow-border); }
  #bandCard.band-red .band-pill { background: var(--red-bg); color: var(--red); border-color: var(--red-border); }
  #bandCard.band-insufficient-data .band-pill { background: var(--indigo-bg); color: var(--indigo); border-color: var(--indigo-border); }
  #bandSub { display: block; margin-top: 6px; font-size: 12.5px; color: var(--text-muted); }
  #bandCard { margin-bottom: 26px; }

  .gauge-track { position: relative; height: 8px; border-radius: 999px; background: var(--surface-2); overflow: visible; margin-bottom: 8px; }
  .gauge-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 999px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1), background-color 0.35s ease; }
  .gauge-fill.band-green { background: var(--green); }
  .gauge-fill.band-yellow { background: var(--yellow); }
  .gauge-fill.band-red { background: var(--red); }
  .gauge-fill.band-insufficient-data { background: var(--indigo); }
  .gauge-tick { position: absolute; top: -3px; width: 1px; height: 14px; background: var(--border-strong); }
  .gauge-labels { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-faint); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  .controls { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; margin-bottom: 26px; }
  .controls-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-faint); font-weight: 700; margin-bottom: 12px; }
  .controls-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: var(--font-sans); font-size: 12.5px; font-weight: 600;
    padding: 10px 16px; border-radius: 999px; cursor: pointer;
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong);
    transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
    min-height: 44px;
  }
  .btn:hover:not(:disabled) { background: #262632; border-color: var(--accent-border); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-healthy:hover:not(:disabled) { border-color: var(--green-border); }
  .btn-verified:hover:not(:disabled) { border-color: var(--accent-border); }
  .btn-unverified { border-color: var(--red-border); }
  .btn-unverified:hover:not(:disabled) { background: var(--red-bg); }
  .btn-live { border-color: var(--green-border); color: var(--green); }
  .btn-live:hover:not(:disabled) { background: var(--green-bg); }
  .btn-auto { margin-left: auto; background: var(--text); color: #0c0c11; border-color: var(--text); }
  .btn-auto:hover:not(:disabled) { background: #d7d9e2; }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) { .btn-auto { margin-left: 0; } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .gauge-fill { transition: none; } }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .card-head .icon-dot {
    width: 24px; height: 24px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-2); color: var(--text-muted); flex-shrink: 0;
  }
  .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); margin: 0; font-weight: 700; }
  .card .subcaption { font-size: 11px; color: var(--text-faint); margin-top: 8px; }
  .stat { font-size: 21px; font-weight: 700; color: var(--text); font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .source-tag { display: block; font-size: 10.5px; color: var(--text-faint); font-family: var(--font-mono); margin-top: 8px; }

  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 12.5px; border: 1px solid transparent; }
  .badge-verified { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
  .badge-verifying { background: var(--yellow-bg); color: var(--yellow); border-color: var(--yellow-border); }
  .badge-unverified { background: var(--red-bg); color: var(--red); border-color: var(--red-border); }
  .badge-unknown { background: var(--indigo-bg); color: var(--indigo); border-color: var(--indigo-border); }

  .action-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; }
  .action-none { color: var(--text-muted); }
  .action-top-up { color: var(--accent); }
  .action-drop-dataset { color: var(--red); }
  .action-hold-and-monitor { color: var(--yellow); }

  .trace-link-card {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    padding: 16px 20px; text-decoration: none; color: inherit;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .trace-link-card:hover { border-color: var(--accent-border); background: var(--surface-2); }
  .trace-link-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .trace-link-left h2 { font-size: 13.5px; font-weight: 700; color: var(--text); margin: 0 0 4px; text-transform: none; letter-spacing: 0; }
  .trace-link-left p { font-size: 11.5px; color: var(--text-faint); margin: 0; font-family: var(--font-mono); }
  .trace-link-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--accent); white-space: nowrap; }
</style>
</head>
<body>
<div class="shell">
${TOPNAV_HTML('')}

  <div class="verify-strip">
    <span id="verifyIcon" class="icon-sm"></span>
    <span>Verified against real <strong>Filecoin Pay</strong> and <strong>PDP</strong> transactions on Filecoin calibration testnet.</span>
  </div>

  <div class="hero">
    <div>
      <p class="eyebrow">Filecoin Pay &middot; Runway Triage</p>
      <h1>Tiered Runway Triage Agent</h1>
      <p class="hero-sub">Autonomous Filecoin storage-budget decisions &mdash; runway &times; PDP proof status.</p>
    </div>
    <div id="bandCard" class="band-insufficient-data hero-stat">
      <div class="hero-stat-label">Runway &middot; % of baseline</div>
      <div class="hero-number-row">
        <span id="gaugePercentLabel">&mdash;</span>
        <span class="band-pill"><span class="band-icon icon-sm" id="bandIcon"></span><span id="bandLabel">Waiting</span></span>
      </div>
      <span id="bandSub"></span>
    </div>
  </div>

  <div class="gauge-track" style="margin-bottom: 26px;">
    <div class="gauge-tick" style="left: 30%"></div>
    <div class="gauge-tick" style="left: 70%"></div>
    <div class="gauge-fill" id="gaugeFill" style="width: 0%"></div>
  </div>

  <div class="controls">
    <div class="controls-label">Simulate a scenario</div>
    <div class="controls-row" id="controlsRow">
      <button class="btn btn-healthy" data-scenario="healthy" type="button">
        <span class="btn-icon"></span><span class="btn-label">Healthy Account</span>
      </button>
      <button class="btn btn-verified" data-scenario="tight-verified" type="button">
        <span class="btn-icon"></span><span class="btn-label">Tight Budget &middot; Proof Verified</span>
      </button>
      <button class="btn btn-unverified" data-scenario="tight-unverified" type="button">
        <span class="btn-icon"></span><span class="btn-label">Tight Budget &middot; Proof Unverified</span>
      </button>
      <button class="btn btn-live" data-scenario="live-verified" type="button">
        <span class="btn-icon"></span><span class="btn-label">Live Verified Run (real testnet)</span>
      </button>
      <button class="btn btn-auto" data-scenario="auto" type="button">
        <span class="btn-icon"></span><span class="btn-label">Run Full Walkthrough</span>
      </button>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-head"><span class="icon-dot" aria-hidden="true">$</span><h2>Filecoin Pay Runway (days)</h2></div>
      <div class="stat" id="estimatedDaysRemaining">&mdash;</div>
      <span class="source-tag">via Filecoin Pay</span>
    </div>
    <div class="card">
      <div class="card-head"><span class="icon-dot" aria-hidden="true">#</span><h2>Est. Epochs Remaining</h2></div>
      <div class="stat" id="estimatedEpochsRemaining">&mdash;</div>
      <span class="source-tag">via Filecoin Pay</span>
    </div>
    <div class="card">
      <div class="card-head"><span class="icon-dot" aria-hidden="true">&#10003;</span><h2>PDP Proof Status</h2></div>
      <div><span id="pdpStatus" class="badge badge-unknown"></span></div>
      <div class="subcaption">Verified via on-chain Proof of Data Possession</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="icon-dot" aria-hidden="true">&rarr;</span><h2>Current Action</h2></div>
      <div class="action-badge action-none" id="actionBadge"><span>&mdash;</span></div>
      <span class="source-tag">via PDP attestation</span>
    </div>
  </div>

  <a class="trace-link-card" href="/trace">
    <div class="trace-link-left">
      <h2>Decision Trace</h2>
      <p>band &rarr; forecast &rarr; PDP status &rarr; action &rarr; reason</p>
    </div>
    <span class="trace-link-cta">View full timeline <span id="traceLinkIcon" class="icon-sm"></span></span>
  </a>

  <footer>FilecoinTLDR Builder Challenge &middot; Cycle 4</footer>
</div>

<script>
(function () {
${SHARED_SCRIPT_PRELUDE}

  document.getElementById('verifyIcon').innerHTML = ICONS.checkSeal;
  document.getElementById('pdpPillIcon').innerHTML = ICONS.checkSeal;
  document.getElementById('traceLinkIcon').innerHTML = ICONS.externalLink;

  var BUTTON_ICON = { healthy: ICONS.check, 'tight-verified': ICONS.alert, 'tight-unverified': ICONS.trash, 'live-verified': ICONS.checkSeal, auto: ICONS.play };
  var BAND_ICON = { green: ICONS.check, yellow: ICONS.alert, red: ICONS.x, 'insufficient-data': ICONS.help };
  var BAND_SUB = { green: 'Runway is healthy, no action needed', yellow: 'Runway is tightening', red: 'Critical &mdash; deciding now', 'insufficient-data': 'Waiting for enough history' };
  var PDP_ICON = { verified: ICONS.check, verifying: ICONS.clock, unverified: ICONS.x };
  var ACTION_ICON = { none: ICONS.minus, 'top-up': ICONS.arrowUp, 'drop-dataset': ICONS.trash, 'hold-and-monitor': ICONS.pause };
  var ACTION_TEXT = { none: 'Monitoring', 'top-up': 'Top-up proposed', 'drop-dataset': 'Dataset dropped', 'hold-and-monitor': 'Holding, re-checking' };

  Array.prototype.forEach.call(document.querySelectorAll('.btn'), function (btn) {
    var iconEl = btn.querySelector('.btn-icon');
    if (iconEl) iconEl.innerHTML = BUTTON_ICON[btn.getAttribute('data-scenario')] || '';
  });

  function fmt(v) { return (v === null || v === undefined) ? '—' : String(v); }

  function renderCurrent(state) {
    var bandCard = document.getElementById('bandCard');
    var band = state.band || null;
    bandCard.className = bandClass(band) + ' hero-stat';
    document.getElementById('bandIcon').innerHTML = BAND_ICON[band] || ICONS.help;
    document.getElementById('bandLabel').textContent = band ? bandLabel(band) : 'Waiting for data…';
    document.getElementById('bandSub').innerHTML = band ? BAND_SUB[band] : '';

    var pct = state.details && typeof state.details.percentOfBaseline === 'number' ? state.details.percentOfBaseline : null;
    var gaugeFill = document.getElementById('gaugeFill');
    gaugeFill.className = 'gauge-fill ' + bandClass(band);
    gaugeFill.style.width = (pct !== null ? Math.max(0, Math.min(100, pct)) : 0) + '%';
    document.getElementById('gaugePercentLabel').textContent = pct !== null ? pct.toFixed(1) + '%' : '—';

    document.getElementById('estimatedDaysRemaining').textContent =
      state.details && state.details.estimatedDaysRemaining !== null && state.details.estimatedDaysRemaining !== undefined
        ? state.details.estimatedDaysRemaining.toFixed(1) + ' days' : '— (infinite)';
    document.getElementById('estimatedEpochsRemaining').textContent = fmt(state.details && state.details.estimatedEpochsRemaining);

    var pdpEl = document.getElementById('pdpStatus');
    var pdpStatus = state.pdpStatus && state.pdpStatus.status;
    pdpEl.className = 'badge ' + (pdpStatus ? 'badge-' + pdpStatus : 'badge-unknown');
    pdpEl.innerHTML = (PDP_ICON[pdpStatus] || ICONS.help) + '<span>' + pdpLabel(pdpStatus) + '</span>';

    var actionEl = document.getElementById('actionBadge');
    var action = state.action || 'none';
    actionEl.className = 'action-badge action-' + action;
    actionEl.innerHTML = (ACTION_ICON[action] || ICONS.minus) + '<span>' + (ACTION_TEXT[action] || action) + '</span>';
  }

  function refresh() {
    return fetch('/state')
      .then(function (r) { return r.json(); })
      .then(function (state) {
        renderCurrent(state.current || {});
        renderMeta(state.meta || null);
      })
      .catch(function () { /* ignore transient poll failures */ });
  }

  function poll() {
    refresh().then(function () {
      setTimeout(poll, 1500);
    });
  }

  function setButtonsBusy(busy, activeBtn) {
    Array.prototype.forEach.call(document.querySelectorAll('.btn'), function (btn) {
      btn.disabled = busy;
      var iconEl = btn.querySelector('.btn-icon');
      if (!iconEl) return;
      if (busy && btn === activeBtn) {
        iconEl.innerHTML = ICONS.spinner;
      } else {
        iconEl.innerHTML = BUTTON_ICON[btn.getAttribute('data-scenario')] || '';
      }
    });
  }

  document.getElementById('controlsRow').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.btn') : null;
    if (!btn || btn.disabled) return;
    var scenario = btn.getAttribute('data-scenario');
    setButtonsBusy(true, btn);
    fetch('/simulate/' + encodeURIComponent(scenario), { method: 'POST' })
      .then(function () { return refresh(); })
      .catch(function () { /* surfaced implicitly: buttons re-enable, state just won't have changed */ })
      .then(function () { setButtonsBusy(false, null); });
  });

  poll();
})();
</script>
</body>
</html>`;

export const TRACE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Decision Trace — Filecoin Runway Triage</title>
<style>
${SHARED_HEAD_STYLE}
  .back-link {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12.5px; font-weight: 600; color: var(--text);
    text-decoration: none; margin-bottom: 20px;
    padding: 9px 15px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border-strong);
    min-height: 40px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .back-link:hover { background: var(--surface-2); border-color: var(--accent-border); }
  .back-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .back-link .icon-sm { transform: rotate(-90deg); color: var(--text-muted); }

  .page-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
  .page-title h1 { font-size: clamp(20px, 2.6vw, 26px); font-weight: 700; margin: 0 0 4px; color: var(--text); letter-spacing: -0.01em; }
  .page-title p { margin: 0; font-size: 12.5px; color: var(--text-faint); font-family: var(--font-mono); }
  .page-title .count { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }

  /* ---- Timeline ---- */
  #log { position: relative; padding-left: 30px; }
  #log::before { content: ''; position: absolute; left: 9px; top: 6px; bottom: 6px; width: 2px; background: var(--border-strong); }
  .tl-entry { position: relative; padding-bottom: 22px; animation: slideIn 0.4s cubic-bezier(0.22,1,0.36,1); }
  .tl-entry:last-child { padding-bottom: 0; }
  /* Only animates transform, never opacity — if this animation ever fails
     to complete (e.g. a background/throttled tab), the element is merely
     mis-positioned by 6px for a moment, never invisible. Visibility must
     never depend on a CSS animation finishing. */
  @keyframes slideIn { from { transform: translateY(-6px); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .tl-entry { animation: none; } }
  .tl-dot {
    position: absolute; left: -30px; top: 0; width: 20px; height: 20px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: var(--shell-bg); border: 2px solid var(--border-strong); z-index: 1;
  }
  .tl-dot .icon-sm { width: 11px; height: 11px; }
  .tl-entry.band-green .tl-dot { border-color: var(--green); color: var(--green); }
  .tl-entry.band-yellow .tl-dot { border-color: var(--yellow); color: var(--yellow); }
  .tl-entry.band-red .tl-dot { border-color: var(--red); color: var(--red); }
  .tl-entry.band-insufficient-data .tl-dot { border-color: var(--indigo); color: var(--indigo); }
  .tl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .tl-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 9px; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .tl-header .badge { padding: 2px 8px; font-size: 10.5px; }
  .tl-header .txref { margin-left: auto; color: var(--text-faint); }
  .tl-header .txref a { color: var(--accent); text-decoration: none; }
  .tl-header .txref a:hover { text-decoration: underline; text-underline-offset: 2px; }
  .tl-header .txref a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tl-action { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  .tl-action.action-none { color: var(--text-muted); }
  .tl-action.action-top-up { color: var(--accent); }
  .tl-action.action-drop-dataset { color: var(--red); }
  .tl-action.action-hold-and-monitor { color: var(--yellow); }
  .tl-reason { font-size: 13.5px; line-height: 1.6; color: var(--text); margin: 0 0 8px; }
  .tl-executed {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--text-muted);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 10px; font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .tl-executed a.tx { color: var(--accent); text-decoration: none; }
  .tl-executed a.tx:hover { text-decoration: underline; text-underline-offset: 2px; }
  .tl-executed a.tx:focus-visible, .tl-executed span.tx { outline-offset: 2px; }
  .tl-executed .tx { color: var(--accent); }
  #empty { color: var(--text-faint); font-style: italic; padding: 32px 4px; text-align: center; }
</style>
</head>
<body>
<div class="shell">
${TOPNAV_HTML('')}

  <a class="back-link" href="/"><span class="icon-sm"></span>Back to dashboard</a>

  <div class="page-title">
    <div>
      <h1>Decision Trace</h1>
      <p>band &rarr; forecast &rarr; PDP status &rarr; action &rarr; reason</p>
    </div>
    <span class="count" id="logCount"></span>
  </div>

  <div id="log" aria-live="polite"><div id="empty">No decisions yet &mdash; go back to the dashboard and click a scenario to begin.</div></div>

  <footer>FilecoinTLDR Builder Challenge &middot; Cycle 4</footer>
</div>

<script>
(function () {
  var MAX_TRACE_ENTRIES = 20;

${SHARED_SCRIPT_PRELUDE}

  document.getElementById('pdpPillIcon').innerHTML = ICONS.checkSeal;
  document.querySelector('.back-link .icon-sm').innerHTML = ICONS.arrowUp;

  var ACTION_ICON = { none: ICONS.minus, 'top-up': ICONS.arrowUp, 'drop-dataset': ICONS.trash, 'hold-and-monitor': ICONS.pause };
  var ACTION_TEXT = { none: 'Monitoring', 'top-up': 'Top-up proposed', 'drop-dataset': 'Dataset dropped', 'hold-and-monitor': 'Holding, re-checking' };
  var BAND_DOT_ICON = { green: ICONS.check, yellow: ICONS.alert, red: ICONS.x, 'insufficient-data': ICONS.help };

  function txSpan(tx) {
    var txStr = String(tx);
    if (isRealTxHash(txStr)) {
      return '<a class="tx" href="' + FILFOX_MESSAGE_BASE + encodeURIComponent(txStr) + '" target="_blank" rel="noopener">' + escapeHtml(txStr) + '</a>';
    }
    return '<span class="tx">' + escapeHtml(txStr) + '</span>';
  }

  function fmtExecuted(ex) {
    if (!ex) return '';
    if (ex.kind === 'top-up') {
      return ICONS.arrowUp + '<span>Executed top-up &middot; <span class="tx">' + escapeHtml(String(ex.amount)) + '</span> base units &middot; tx ' + txSpan(ex.txHash) + '</span>';
    }
    if (ex.kind === 'drop-dataset') {
      return ICONS.trash + '<span>Executed drop &middot; data set <span class="tx">' + escapeHtml(String(ex.dataSetId)) + '</span> &middot; end epoch <span class="tx">' + escapeHtml(String(ex.endEpoch)) + '</span>' + (ex.txHash ? ' &middot; tx ' + txSpan(ex.txHash) : '') + '</span>';
    }
    return ICONS.minus + '<span>No on-chain action taken</span>';
  }

  function txRef(evt) {
    var tx = evt.executed && evt.executed.txHash ? String(evt.executed.txHash) : null;
    if (tx && isRealTxHash(tx)) {
      var short = tx.length > 10 ? (tx.slice(0, 6) + '…' + tx.slice(-4)) : tx;
      return '<a href="' + FILFOX_MESSAGE_BASE + encodeURIComponent(tx) + '" target="_blank" rel="noopener">' + escapeHtml(short) + '</a>';
    }
    return '#' + escapeHtml(String(evt.seq));
  }

  // Tracks what's currently rendered so an unchanged poll response (the
  // common case — most 1.5s ticks bring no new decision) doesn't destroy
  // and recreate every DOM node. Rebuilding unconditionally on every poll
  // meant each entry's entrance animation restarted every 1.5s forever;
  // in a throttled/backgrounded tab that could leave entries mid-animation
  // indefinitely — skipping identical re-renders removes the failure mode
  // entirely, not just its opacity symptom (see the transform-only
  // slideIn keyframe above for the other half of that fix).
  var lastRenderedKey = null;

  function renderLog(events) {
    var logEl = document.getElementById('log');
    var countEl = document.getElementById('logCount');
    countEl.textContent = events.length ? ('showing latest ' + Math.min(events.length, MAX_TRACE_ENTRIES) + ' of ' + events.length) : '';

    var key = events.length ? (events.length + ':' + events[events.length - 1].seq) : 'empty';
    if (key === lastRenderedKey) return;
    lastRenderedKey = key;

    if (!events.length) {
      logEl.innerHTML = '<div id="empty">No decisions yet &mdash; go back to the dashboard and click a scenario to begin.</div>';
      return;
    }
    var visible = events.slice(-MAX_TRACE_ENTRIES).slice().reverse();
    logEl.innerHTML = '';
    visible.forEach(function (evt) {
      var action = evt.action || 'none';
      var div = document.createElement('div');
      div.className = 'tl-entry ' + bandClass(evt.band);
      div.innerHTML =
        '<div class="tl-dot">' + (BAND_DOT_ICON[evt.band] || ICONS.help) + '</div>' +
        '<div class="tl-card">' +
          '<div class="tl-header">' + ICONS.clock +
          ' #' + evt.seq + ' &middot; ' + escapeHtml(new Date(evt.timestamp).toLocaleTimeString()) +
          ' <span class="badge badge-' + (evt.band === 'red' ? 'unverified' : evt.band === 'green' ? 'verified' : evt.band === 'yellow' ? 'verifying' : 'unknown') + '">' + bandLabel(evt.band) + '</span>' +
          '<span class="txref">' + txRef(evt) + '</span></div>' +
          '<div class="tl-action action-' + action + '">' + (ACTION_ICON[action] || ICONS.minus) + '<span>' + (ACTION_TEXT[action] || action) + '</span></div>' +
          '<div class="tl-reason">' + escapeHtml(evt.reason) + '</div>' +
          '<div class="tl-executed">' + fmtExecuted(evt.executed) + '</div>' +
        '</div>';
      logEl.appendChild(div);
    });
  }

  function refresh() {
    return fetch('/state')
      .then(function (r) { return r.json(); })
      .then(function (state) {
        renderLog(state.events || []);
        renderMeta(state.meta || null);
      })
      .catch(function () { /* ignore transient poll failures */ });
  }

  function poll() {
    refresh().then(function () {
      setTimeout(poll, 1500);
    });
  }

  poll();
})();
</script>
</body>
</html>`;
