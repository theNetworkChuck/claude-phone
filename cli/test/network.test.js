import { test } from 'node:test';
import assert from 'node:assert';
import {
  isReachable,
  checkClaudeApiServer
} from '../lib/network.js';

test('network module', async (t) => {
  await t.test('isReachable returns boolean', async () => {
    // Test with localhost (should be reachable)
    const result = await isReachable('127.0.0.1');

    assert.ok(typeof result === 'boolean', 'isReachable should return boolean');
  });

  await t.test('isReachable detects localhost as reachable', async () => {
    const result = await isReachable('127.0.0.1', 1000);

    assert.strictEqual(result, true, 'Localhost should be reachable');
  });

  await t.test('isReachable detects unreachable IP', async () => {
    // Use a non-routable IP that will timeout
    // 192.0.2.1 is TEST-NET-1, reserved for documentation
    const result = await isReachable('192.0.2.1', 500);

    assert.strictEqual(result, false, 'Test IP should not be reachable');
  });

  await t.test('isReachable times out correctly', async () => {
    const timeout = 500;
    const startTime = Date.now();
    await isReachable('192.0.2.1', timeout);
    const duration = Date.now() - startTime;

    // Should timeout within timeout + 200ms margin
    assert.ok(duration < timeout + 300, 'Should timeout within specified time');
  });

  await t.test('isReachable handles invalid IP gracefully', async () => {
    const result = await isReachable('not-an-ip', 500);

    assert.strictEqual(result, false, 'Invalid IP should return false');
  });

  await t.test('checkClaudeApiServer returns result object', async () => {
    // Test with a URL that won't exist
    const result = await checkClaudeApiServer('http://192.0.2.1:3333');

    assert.ok(result, 'checkClaudeApiServer should return a result');
    assert.ok('reachable' in result, 'result should have reachable property');
    assert.ok(typeof result.reachable === 'boolean', 'reachable should be boolean');
  });

  await t.test('checkClaudeApiServer detects unreachable server', async () => {
    const result = await checkClaudeApiServer('http://192.0.2.1:3333');

    assert.strictEqual(result.reachable, false, 'Unreachable server should return false');
  });

  await t.test('checkClaudeApiServer validates URL format', async () => {
    const result = await checkClaudeApiServer('not-a-url');

    assert.strictEqual(result.reachable, false, 'Invalid URL should return false');
  });

  await t.test('checkClaudeApiServer includes healthy property when reachable', async () => {
    // We can't guarantee a real server for testing
    // Just verify the structure is correct
    const result = await checkClaudeApiServer('http://127.0.0.1:9999');

    assert.ok('reachable' in result, 'Should have reachable property');
    // If reachable is true, should also have healthy
    if (result.reachable) {
      assert.ok('healthy' in result, 'Should have healthy property when reachable');
      assert.ok(typeof result.healthy === 'boolean', 'healthy should be boolean');
    }
  });
});
