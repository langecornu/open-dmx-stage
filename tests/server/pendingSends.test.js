// Tests for the helper that lets a driver wait for in-flight sends before closing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PendingSends } from '../../server/clients/pendingSends.js';

describe('PendingSends', () => {
  it('is settled at once when nothing is in flight', async () => {
    const started = Date.now();
    await new PendingSends().settled();
    assert.ok(Date.now() - started < 50, 'no waiting');
  });

  it('waits for every send that was started, and forgets them afterwards', async () => {
    const pending = new PendingSends();
    const finished = [];
    pending.track((done) => setTimeout(() => (finished.push('a'), done()), 10));
    pending.track((done) => setTimeout(() => (finished.push('b'), done()), 25));
    assert.equal(pending.inFlight.size, 2, 'both are tracked');
    await pending.settled();
    assert.deepEqual(finished, ['a', 'b'], 'it waited for the slower one');
    await Promise.resolve();
    assert.equal(pending.inFlight.size, 0, 'finished sends are forgotten');
  });

  it('gives up after the timeout when a send never finishes', async () => {
    const pending = new PendingSends();
    pending.track(() => {});
    const started = Date.now();
    await pending.settled(40);
    const waited = Date.now() - started;
    assert.ok(waited >= 35 && waited < 500, `it waited about the timeout (${waited} ms)`);
  });
});
