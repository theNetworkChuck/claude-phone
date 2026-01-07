import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateElevenLabsKey,
  validateOpenAIKey
} from '../lib/validators.js';

test('validators module', async (t) => {
  await t.test('validateElevenLabsKey rejects empty key', async () => {
    const result = await validateElevenLabsKey('');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /API key cannot be empty/);
  });

  await t.test('validateElevenLabsKey rejects invalid format', async () => {
    const result = await validateElevenLabsKey('invalid-key');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  await t.test('validateOpenAIKey rejects empty key', async () => {
    const result = await validateOpenAIKey('');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /API key cannot be empty/);
  });

  await t.test('validateOpenAIKey rejects invalid format', async () => {
    const result = await validateOpenAIKey('invalid-key');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  // Note: We can't test successful validation without real API keys
  // These would be integration tests, not unit tests
});
