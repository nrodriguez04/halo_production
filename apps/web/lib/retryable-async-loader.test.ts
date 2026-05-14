import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryableAsyncLoader } from './retryable-async-loader';

test('retries after a rejected load instead of caching the failure', async () => {
  let attempts = 0;
  const load = createRetryableAsyncLoader(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('temporary chunk failure');
    }
    return 'loaded';
  });

  await assert.rejects(load(), /temporary chunk failure/);
  await assert.doesNotReject(load());
  await assert.doesNotReject(load());
  assert.equal(attempts, 2);
});

test('shares a single in-flight load across concurrent callers', async () => {
  let attempts = 0;
  let resolveValue!: (value: string) => void;
  const gate = new Promise<string>((resolve) => {
    resolveValue = resolve;
  });

  const load = createRetryableAsyncLoader(async () => {
    attempts += 1;
    return gate;
  });

  const first = load();
  const second = load();
  resolveValue('ready');

  assert.equal(await first, 'ready');
  assert.equal(await second, 'ready');
  assert.equal(attempts, 1);
});
