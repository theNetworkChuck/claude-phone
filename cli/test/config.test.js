import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getConfigPath,
  getConfigDir,
  loadConfig,
  saveConfig,
  configExists
} from '../lib/config.js';

// Test config directory
const TEST_HOME = path.join(os.tmpdir(), 'claude-phone-test-' + Date.now());
process.env.HOME = TEST_HOME;

test('config module', async (t) => {
  await t.test('getConfigDir returns ~/.claude-phone', () => {
    const dir = getConfigDir();
    assert.strictEqual(dir, path.join(TEST_HOME, '.claude-phone'));
  });

  await t.test('getConfigPath returns ~/.claude-phone/config.json', () => {
    const configPath = getConfigPath();
    assert.strictEqual(configPath, path.join(TEST_HOME, '.claude-phone', 'config.json'));
  });

  await t.test('configExists returns false when no config', () => {
    assert.strictEqual(configExists(), false);
  });

  await t.test('saveConfig creates directory and writes config', async () => {
    const config = {
      version: '1.0.0',
      api: {
        elevenlabs: { apiKey: 'test-key-123', validated: true }
      }
    };

    await saveConfig(config);

    const configPath = getConfigPath();
    assert.strictEqual(fs.existsSync(configPath), true);

    const stats = fs.statSync(configPath);
    // Check permissions are 0600 (owner read/write only)
    assert.strictEqual((stats.mode & 0o777).toString(8), '600');
  });

  await t.test('loadConfig reads saved config', async () => {
    const config = await loadConfig();
    assert.strictEqual(config.version, '1.0.0');
    assert.strictEqual(config.api.elevenlabs.apiKey, 'test-key-123');
  });

  await t.test('configExists returns true after save', () => {
    assert.strictEqual(configExists(), true);
  });

  await t.test('saveConfig updates existing config', async () => {
    const updated = {
      version: '1.0.0',
      api: {
        elevenlabs: { apiKey: 'updated-key', validated: true },
        openai: { apiKey: 'openai-key', validated: false }
      }
    };

    await saveConfig(updated);
    const config = await loadConfig();
    assert.strictEqual(config.api.elevenlabs.apiKey, 'updated-key');
    assert.strictEqual(config.api.openai.apiKey, 'openai-key');
  });

  await t.test('config with deployment.mode defaults to standard', async () => {
    const config = {
      version: '1.1.0',
      deployment: {
        mode: 'standard',
        platform: 'darwin'
      },
      api: {}
    };

    await saveConfig(config);
    const loaded = await loadConfig();
    assert.strictEqual(loaded.deployment.mode, 'standard');
    assert.strictEqual(loaded.deployment.platform, 'darwin');
  });

  await t.test('config with pi-split mode includes pi section', async () => {
    const config = {
      version: '1.1.0',
      deployment: {
        mode: 'pi-split',
        platform: 'linux-arm64',
        piDetected: true,
        pi: {
          sbcDetected: true,
          drachtioPort: 5070,
          macApiUrl: 'http://192.168.1.100:3333'
        }
      },
      api: {}
    };

    await saveConfig(config);
    const loaded = await loadConfig();
    assert.strictEqual(loaded.deployment.mode, 'pi-split');
    assert.strictEqual(loaded.deployment.pi.drachtioPort, 5070);
    assert.strictEqual(loaded.deployment.pi.macApiUrl, 'http://192.168.1.100:3333');
  });

  await t.test('config version 1.1.0 includes deployment field', async () => {
    const config = {
      version: '1.1.0',
      deployment: {
        mode: 'standard',
        platform: 'darwin'
      }
    };

    await saveConfig(config);
    const loaded = await loadConfig();
    assert.strictEqual(loaded.version, '1.1.0');
    assert.ok('deployment' in loaded, 'Should have deployment field');
  });

  // Cleanup
  t.after(() => {
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });
});
