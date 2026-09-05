import http, { type Server } from 'node:http';
import type { DecisionTrace } from '../decision-engine/index.js';
import type { ExecutedAction } from '../onchain/actions.js';
import { DASHBOARD_HTML } from './page.js';

/**
 * One entry in the decision log served to the UI. Wraps the raw
 * `DecisionTrace` (plus whatever `ExecutedAction` came back from
 * `executeDecision`, if any) with a monotonic sequence number and a
 * wall-clock timestamp so the page can render a stable, ordered,
 * append-only log without needing to diff trace objects itself.
 */
export interface DecisionLogEntry {
  seq: number;
  timestamp: number;
  band: DecisionTrace['band'];
  action: DecisionTrace['action'];
  reason: string;
  forecast: DecisionTrace['forecast'];
  pdpStatus: DecisionTrace['pdpStatus'];
  details: DecisionTrace['details'];
  executed?: ExecutedAction;
}

/** JSON shape served at GET /state. `current` is the most recent entry (or null before the first push); `events` is the full running log, oldest first. */
export interface DashboardState {
  current: DecisionLogEntry | null;
  events: DecisionLogEntry[];
}

export interface DashboardServer {
  /** Feed a new decision (and, once available, its executed action result) into the running dashboard. Appends to the log and becomes the new `current` state. */
  pushDecision(trace: DecisionTrace, executed?: ExecutedAction): void;
  /**
   * Registers the handler invoked when a client POSTs `/simulate/:name`
   * (the dashboard's interactive scenario buttons). The handler is
   * responsible for running the real decision engine for `name` and calling
   * `pushDecision` itself — this module deliberately knows nothing about
   * scenarios/decision-engine types, keeping it a generic HTTP+state layer
   * (the integration lives in src/demo/run-live-demo.ts, same pattern as
   * the existing drain-scenario wiring). Only one handler at a time;
   * registering again replaces the previous one.
   */
  onSimulate(handler: (name: string) => Promise<void>): void;
  /** Starts the HTTP server. Pass 0 (or omit) for an OS-assigned ephemeral port — useful for tests. Resolves once listening. */
  start(port?: number): Promise<{ url: string; stop: () => void }>;
}

/**
 * Creates a minimal, dependency-free live dashboard server.
 *
 * Live-update mechanism: plain polling (`GET /state` every 1.5s from the
 * client), not Server-Sent Events. Chosen over SSE because it is strictly
 * less code and less brittle for this use case: no long-lived response
 * stream to keep open/flushed correctly across Node's `http` module, no
 * reconnect/backoff logic needed client-side, and no risk of a stale
 * half-open connection surviving a demo hiccup. A 1.5s poll interval is
 * fast enough for "watch it happen live" while keeping the implementation
 * to a single stateless JSON endpoint.
 */
export function createDashboardServer(): DashboardServer {
  const events: DecisionLogEntry[] = [];
  let seq = 0;
  let server: Server | null = null;
  let simulateHandler: ((name: string) => Promise<void>) | null = null;

  function onSimulate(handler: (name: string) => Promise<void>): void {
    simulateHandler = handler;
  }

  function pushDecision(trace: DecisionTrace, executed?: ExecutedAction): void {
    events.push({
      seq: seq++,
      timestamp: Date.now(),
      band: trace.band,
      action: trace.action,
      reason: trace.reason,
      forecast: trace.forecast,
      pdpStatus: trace.pdpStatus,
      details: trace.details,
      executed,
    });
  }

  function getState(): DashboardState {
    return {
      current: events.length > 0 ? events[events.length - 1] : null,
      events,
    };
  }

  function start(port = 0): Promise<{ url: string; stop: () => void }> {
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        Promise.resolve()
          .then(async () => {
            const url = req.url ?? '/';
            if (url === '/' || url === '/index.html') {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(DASHBOARD_HTML);
              return;
            }
            if (url === '/state') {
              const body = JSON.stringify(
                getState(),
                (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
              );
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(body);
              return;
            }
            if (req.method === 'POST' && url.startsWith('/simulate/')) {
              const name = decodeURIComponent(url.slice('/simulate/'.length));
              if (!simulateHandler) {
                res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'No simulate handler registered' }));
                return;
              }
              try {
                await simulateHandler(name);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
              }
              return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
          })
          .catch((err) => {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            res.end(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
          });
      });

      server.once('error', reject);
      server.listen(port, () => {
        const address = server?.address();
        const actualPort = typeof address === 'object' && address !== null ? address.port : port;
        const url = `http://127.0.0.1:${actualPort}`;
        resolve({
          url,
          stop: () => {
            server?.close();
          },
        });
      });
    });
  }

  return { pushDecision, onSimulate, start };
}
