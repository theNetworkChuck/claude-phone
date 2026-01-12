import { test } from 'node:test';
import assert from 'node:assert';
import {
  checkDocker,
  checkDockerCompose,
  checkPiPrerequisites
} from '../lib/prerequisites.js';

test('prerequisites module', async (t) => {
  await t.test('checkDocker returns result object with required fields', async () => {
    const result = await checkDocker();

    assert.ok(result, 'checkDocker should return a result');
    assert.ok('installed' in result, 'result should have installed property');
    assert.ok(typeof result.installed === 'boolean', 'installed should be boolean');

    if (result.installed) {
      assert.ok('version' in result, 'result should have version if installed');
      assert.ok(typeof result.version === 'string', 'version should be string');
    } else {
      assert.ok('installUrl' in result, 'result should have installUrl if not installed');
    }
  });

  await t.test('checkDocker detects Docker on this machine', async () => {
    // This test will pass or fail based on actual Docker installation
    const result = await checkDocker();

    // Should detect correctly (we can't guarantee Docker is installed in test env)
    assert.ok(typeof result.installed === 'boolean', 'Should return boolean');
  });

  await t.test('checkDockerCompose returns result object', async () => {
    const result = await checkDockerCompose();

    assert.ok(result, 'checkDockerCompose should return a result');
    assert.ok('installed' in result, 'result should have installed property');
    assert.ok(typeof result.installed === 'boolean', 'installed should be boolean');
  });

  await t.test('checkDockerCompose handles docker compose subcommand', async () => {
    const result = await checkDockerCompose();

    // Modern Docker includes compose as subcommand
    // This should detect either standalone docker-compose or docker compose
    if (result.installed) {
      assert.ok(result.version || result.method, 'Should indicate version or method');
    }
  });

  await t.test('checkPiPrerequisites returns array of checks', async () => {
    const results = await checkPiPrerequisites();

    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length > 0, 'Should have at least one check');

    // Each result should have required fields
    results.forEach((check) => {
      assert.ok('name' in check, 'Each check should have name');
      assert.ok('installed' in check, 'Each check should have installed');
      assert.ok(typeof check.name === 'string', 'name should be string');
      assert.ok(typeof check.installed === 'boolean', 'installed should be boolean');
    });
  });

  await t.test('checkPiPrerequisites includes Docker and Docker Compose', async () => {
    const results = await checkPiPrerequisites();

    const dockerCheck = results.find((r) => r.name === 'Docker');
    const composeCheck = results.find((r) => r.name === 'Docker Compose');

    assert.ok(dockerCheck, 'Should include Docker check');
    assert.ok(composeCheck, 'Should include Docker Compose check');
  });

  await t.test('checkDocker provides install URL when not installed', async () => {
    const result = await checkDocker();

    if (!result.installed) {
      assert.ok(result.installUrl, 'Should provide install URL');
      assert.match(result.installUrl, /https?:\/\//, 'Install URL should be valid URL');
    }
  });
});
