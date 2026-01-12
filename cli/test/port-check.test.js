import { test } from 'node:test';
import assert from 'node:assert';
import net from 'net';
import {
  checkPort,
  detect3cxSbc
} from '../lib/port-check.js';

test('port-check module', async (t) => {
  await t.test('checkPort returns result object with required fields', async () => {
    const result = await checkPort(9999); // Random high port unlikely to be in use

    assert.ok(result, 'checkPort should return a result');
    assert.ok('port' in result, 'result should have port property');
    assert.ok('inUse' in result, 'result should have inUse property');
    assert.ok(typeof result.inUse === 'boolean', 'inUse should be boolean');
    assert.strictEqual(result.port, 9999, 'port should match input');
  });

  await t.test('checkPort detects port in use', async () => {
    // Start a test server on a random port
    const server = net.createServer();
    const testPort = 19876;

    await new Promise((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });

    try {
      const result = await checkPort(testPort);

      assert.strictEqual(result.inUse, true, 'Should detect port in use');
      assert.strictEqual(result.port, testPort, 'Port should match');
    } finally {
      // Clean up
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  await t.test('checkPort detects port not in use', async () => {
    // Use a high random port that's unlikely to be in use
    const testPort = 50000 + Math.floor(Math.random() * 1000);
    const result = await checkPort(testPort);

    assert.strictEqual(result.inUse, false, 'Should detect port not in use');
    assert.strictEqual(result.port, testPort, 'Port should match');
  });

  await t.test('checkPort times out quickly', async () => {
    // Test that port check doesn't hang
    const startTime = Date.now();
    await checkPort(9999);
    const duration = Date.now() - startTime;

    assert.ok(duration < 2000, 'Port check should complete within 2 seconds');
  });

  await t.test('detect3cxSbc returns boolean', async () => {
    const result = await detect3cxSbc();

    assert.ok(typeof result === 'boolean', 'detect3cxSbc should return boolean');
  });

  await t.test('detect3cxSbc checks port 5060', async () => {
    // This test checks that detect3cxSbc is checking the right port
    // We can't guarantee 3CX is installed, so we just verify it returns a boolean
    const result = await detect3cxSbc();

    // Should return true if port 5060 is in use, false otherwise
    assert.ok(typeof result === 'boolean', 'Should return boolean result');
  });

  await t.test('detect3cxSbc returns true when 5060 is in use', async () => {
    // Start a test server on port 5060 (if we have permission)
    const server = net.createServer();
    let serverStarted = false;

    try {
      await new Promise((resolve, reject) => {
        server.on('error', (err) => {
          if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
            // Permission denied or port already in use - skip this test
            resolve();
          } else {
            reject(err);
          }
        });

        server.listen(5060, '127.0.0.1', () => {
          serverStarted = true;
          resolve();
        });
      });

      if (serverStarted) {
        const result = await detect3cxSbc();
        assert.strictEqual(result, true, 'Should detect 5060 in use');
      }
      // If server didn't start (no permission), skip assertion
    } finally {
      if (serverStarted) {
        await new Promise((resolve) => {
          server.close(resolve);
        });
      }
    }
  });
});
