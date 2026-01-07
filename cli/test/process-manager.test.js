import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  isServerRunning,
  startServer,
  stopServer,
  getServerPid
} from '../lib/process-manager.js';

// Test PID file location
const TEST_HOME = path.join(os.tmpdir(), 'claude-phone-pm-test-' + Date.now());
const TEST_PID_FILE = path.join(TEST_HOME, 'server.pid');

test('process-manager module', async (t) => {
  t.before(() => {
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
  });

  await t.test('isServerRunning returns false when no PID file', async () => {
    assert.strictEqual(await isServerRunning(TEST_PID_FILE), false);
  });

  await t.test('getServerPid returns null when no PID file', () => {
    assert.strictEqual(getServerPid(TEST_PID_FILE), null);
  });

  await t.test('startServer creates PID file', async () => {
    // Mock server command (sleep for testing)
    const serverPath = '/bin';
    const port = 3333;

    const pid = await startServer(serverPath, port, TEST_PID_FILE);
    assert.ok(pid > 0);
    assert.strictEqual(fs.existsSync(TEST_PID_FILE), true);
  });

  await t.test('isServerRunning returns true when server is running', async () => {
    assert.strictEqual(await isServerRunning(TEST_PID_FILE), true);
  });

  await t.test('getServerPid returns PID from file', () => {
    const pid = getServerPid(TEST_PID_FILE);
    assert.ok(pid > 0);
  });

  await t.test('stopServer kills process and removes PID file', async () => {
    await stopServer(TEST_PID_FILE);
    assert.strictEqual(fs.existsSync(TEST_PID_FILE), false);
    assert.strictEqual(await isServerRunning(TEST_PID_FILE), false);
  });

  // Cleanup
  t.after(() => {
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });
});
