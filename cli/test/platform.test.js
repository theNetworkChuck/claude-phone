import { test } from 'node:test';
import assert from 'node:assert';
import {
  detectPlatform,
  isRaspberryPi,
  getPiModel
} from '../lib/platform.js';

test('platform module', async (t) => {
  await t.test('detectPlatform returns object with os, arch, isPi', async () => {
    const result = await detectPlatform();

    assert.ok(result, 'detectPlatform should return a result');
    assert.ok('os' in result, 'result should have os property');
    assert.ok('arch' in result, 'result should have arch property');
    assert.ok('isPi' in result, 'result should have isPi property');
    assert.ok(typeof result.isPi === 'boolean', 'isPi should be boolean');
  });

  await t.test('detectPlatform identifies current platform correctly', async () => {
    const result = await detectPlatform();

    // Should match Node's process values
    assert.strictEqual(result.os, process.platform);
    assert.strictEqual(result.arch, process.arch);
  });

  await t.test('isPi is false on darwin (Mac)', async () => {
    // This test will pass on Mac
    if (process.platform === 'darwin') {
      const result = await detectPlatform();
      assert.strictEqual(result.isPi, false, 'Mac should not be detected as Pi');
    }
  });

  await t.test('isPi is false on x64 Linux', async () => {
    // This test checks that x64 architecture is not considered Pi
    if (process.platform === 'linux' && process.arch === 'x64') {
      const result = await detectPlatform();
      assert.strictEqual(result.isPi, false, 'x64 Linux should not be detected as Pi');
    }
  });

  await t.test('isRaspberryPi returns boolean', async () => {
    const result = await isRaspberryPi();
    assert.ok(typeof result === 'boolean', 'isRaspberryPi should return boolean');
  });

  await t.test('isRaspberryPi is false on Mac', async () => {
    if (process.platform === 'darwin') {
      const result = await isRaspberryPi();
      assert.strictEqual(result, false, 'Should return false on Mac');
    }
  });

  await t.test('getPiModel returns null on non-Pi systems', async () => {
    // On Mac or x64 Linux, should return null
    if (process.platform === 'darwin' || process.arch === 'x64') {
      const result = await getPiModel();
      assert.strictEqual(result, null, 'Should return null on non-Pi systems');
    }
  });

  await t.test('getPiModel handles missing /proc file gracefully', async () => {
    // Should not throw error even if file doesn't exist
    const result = await getPiModel();
    assert.ok(result === null || typeof result === 'string', 'Should return null or string');
  });
});
