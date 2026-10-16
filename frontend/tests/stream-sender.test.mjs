import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamSender } from '../dist/stream-sender.js';

test('backpressure retries the same chunk and preserves order without dropping frames', async () => {
  const requests = []; let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const backend = { async pushStream(sequence, body) {
    requests.push({ sequence, text: await body.text() });
    if (requests.length === 1) throw Object.assign(Error('queue full'), { status: 429 });
  } };
  let failure; const accepted = [];
  const sender = new StreamSender(backend, error => { failure = error; }, () => waiting);
  sender.enqueue(['first'], () => accepted.push('first')); sender.enqueue(['second'], () => accepted.push('second'));
  assert.equal(sender.full, true);
  assert.deepEqual(accepted, []);
  assert.throws(() => sender.enqueue(['third']), /队列已满/);
  await new Promise(resolve => setImmediate(resolve)); release();
  await sender.idle();
  assert.equal(failure, undefined);
  assert.deepEqual(requests, [{ sequence: 0, text: 'first' }, { sequence: 0, text: 'first' }, { sequence: 1, text: 'second' }]);
  assert.equal(sender.full, false);
  assert.deepEqual(accepted, ['first', 'second']);
});

test('permanent input error fails rather than silently skipping a chunk', async () => {
  let failure, accepted = false;
  const sender = new StreamSender({ async pushStream() { throw Object.assign(Error('closed'), { status: 409 }); } }, error => { failure = error; });
  sender.enqueue(['frame'], () => { accepted = true; });
  await assert.rejects(sender.idle(), /closed/);
  assert.equal(failure.status, 409);
  assert.equal(sender.queue.length, 1);
  assert.equal(accepted, false);
});
