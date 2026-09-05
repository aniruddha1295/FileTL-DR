import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/demo/scenarios.js';
import { evaluate } from '../src/decision-engine/index.js';

describe('SCENARIOS (interactive dashboard buttons)', () => {
  it('"healthy" produces green/none through the real evaluate()', () => {
    const s = SCENARIOS.healthy;
    const trace = evaluate(s.history, s.pdpStatus);
    expect(trace.band).toBe('green');
    expect(trace.action).toBe('none');
  });

  it('"tight-verified" produces red/top-up through the real evaluate()', () => {
    const s = SCENARIOS['tight-verified'];
    const trace = evaluate(s.history, s.pdpStatus);
    expect(trace.band).toBe('red');
    expect(trace.action).toBe('top-up');
    expect(trace.details.suggestedTopUpAmount).not.toBeNull();
  });

  it('"tight-unverified" produces red/drop-dataset through the real evaluate() — the headline moment', () => {
    const s = SCENARIOS['tight-unverified'];
    const trace = evaluate(s.history, s.pdpStatus);
    expect(trace.band).toBe('red');
    expect(trace.action).toBe('drop-dataset');
    expect(trace.details.suggestedTopUpAmount).toBeNull();
    expect(trace.reason).toMatch(/unverified/i);
  });
});
