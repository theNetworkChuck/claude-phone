import chalk from 'chalk';
import inquirer from 'inquirer';
import { detectPlatform } from './prereqs/platform.js';
import { checkNode } from './prereqs/checks/node.js';
import { checkDocker } from './prereqs/checks/docker.js';
import { checkCompose } from './prereqs/checks/compose.js';
import { checkDisk } from './prereqs/checks/disk.js';
import { checkNetwork } from './prereqs/checks/network.js';
import { installNode } from './prereqs/installers/node.js';
import { installDocker } from './prereqs/installers/docker.js';
import { installDockerDesktop } from './prereqs/installers/docker-desktop.js';
import { saveState, loadState, rollback } from './prereqs/utils/rollback.js';

/**
 * Run all prerequisite checks
 * @param {object} options - Options
 * @param {string} options.type - Installation type ('minimal' | 'api-server' | 'voice-server' | 'both')
 * @returns {Promise<{success: boolean, results: object}>}
 */
export async function runPrereqChecks(options = {}) {
  const { type = 'both' } = options;

  console.log(chalk.bold.cyan('\n🔍 Checking prerequisites...\n'));

  // Detect platform
  const platform = await detectPlatform();

  console.log(chalk.gray(`Platform: ${platform.os} (${platform.arch})`));
  if (platform.isPi) {
    console.log(chalk.cyan('🥧 Raspberry Pi detected'));
  }
  console.log('');

  // Determine which checks to run based on type
  const checksToRun = [];
  const results = {};

  // Node.js is always required
  checksToRun.push({ name: 'node', check: checkNode(platform) });

  // Add type-specific checks
  if (type === 'voice-server' || type === 'both') {
    checksToRun.push({ name: 'docker', check: checkDocker(platform) });
    checksToRun.push({ name: 'compose', check: checkCompose(platform) });
    checksToRun.push({ name: 'disk', check: checkDisk(platform) });
  }

  // Network check for auto-fix capability (not for API server only)
  if (type !== 'api-server') {
    checksToRun.push({ name: 'network', check: checkNetwork(platform) });
  }

  // Run checks in parallel
  const checkResults = await Promise.all(checksToRun.map(c => c.check));
  checksToRun.forEach((c, i) => {
    results[c.name] = checkResults[i];
  });

  // Display results
  displayResults(results);

  // Check if all passed
  const allPassed = checkAllPassed(results);

  if (allPassed) {
    console.log(chalk.green('\n✅ All prerequisites met!\n'));
    return { success: true, results };
  }

  // Some checks failed - offer auto-fix
  console.log(chalk.yellow('\n❌ Some prerequisites not met.\n'));

  // Check if we're offline (only if network check was run)
  if (results.network && results.network.autoFixDisabled) {
    console.log(chalk.yellow('⚠️  Auto-fix is disabled (npm registry unreachable)'));
    console.log(chalk.gray('Please check your internet connection.\n'));
    return { success: false, results };
  }

  // Offer to fix failures
  const fixResult = await offerAutoFix(results, platform);

  if (fixResult.success) {
    console.log(chalk.green('\n✅ All prerequisites now met!\n'));
    return { success: true, results };
  }

  return { success: false, results };
}

/**
 * Display check results
 * @param {object} results - Check results
 * @returns {void}
 */
function displayResults(results) {
  for (const result of Object.values(results)) {
    if (result.passed) {
      console.log(chalk.green(`  ✓ ${result.message}`));
    } else {
      console.log(chalk.red(`  ✗ ${result.message}`));
    }
  }
}

/**
 * Check if all prerequisites passed
 * @param {object} results - Check results
 * @returns {boolean} True if all passed
 */
function checkAllPassed(results) {
  // Only check results that were actually run (network is informational only)
  const criticalKeys = ['node', 'docker', 'compose', 'disk'];

  for (const key of criticalKeys) {
    if (results[key] && !results[key].passed) {
      return false;
    }
  }

  return true;
}

/**
 * Offer to auto-fix failed prerequisites
 * @param {object} results - Check results
 * @param {object} platform - Platform info
 * @returns {Promise<{success: boolean}>}
 */
async function offerAutoFix(results, platform) {
  const failures = [];

  if (results.node && !results.node.passed && results.node.canAutoFix) {
    failures.push('node');
  }

  if (results.docker && !results.docker.passed && results.docker.canAutoFix) {
    failures.push('docker');
  }

  if (results.disk && !results.disk.passed) {
    console.log(chalk.red('\n❌ Insufficient disk space.'));
    console.log(chalk.yellow(`Required: ${results.disk.required}, Available: ${results.disk.available || 'unknown'}`));
    console.log(chalk.gray('Please free up disk space and try again.\n'));
    return { success: false };
  }

  if (results.compose && !results.compose.passed) {
    console.log(chalk.yellow('\n⚠️  Docker Compose is usually installed with Docker.'));
    console.log(chalk.gray('If Docker installation succeeds, Docker Compose should be available.\n'));
  }

  if (failures.length === 0) {
    return { success: false };
  }

  // Save state before making changes
  await saveState(platform);

  // Fix each failure
  for (const failure of failures) {
    let fixResult;

    switch (failure) {
      case 'node':
        fixResult = await installNode(platform);
        break;

      case 'docker':
        if (platform.os === 'darwin') {
          fixResult = await installDockerDesktop(platform);
        } else {
          fixResult = await installDocker(platform);
        }
        break;
    }

    if (!fixResult.success) {
      if (fixResult.cancelled) {
        console.log(chalk.gray('\nSetup cancelled by user.'));
        console.log(chalk.gray('Run "claude-phone setup" again after installing prerequisites manually.\n'));
        return { success: false };
      }

      // Installation failed
      console.log(chalk.red('\n❌ Auto-fix failed.'));

      // Offer rollback
      const { shouldRollback } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldRollback',
          message: 'View rollback information?',
          default: false
        }
      ]);

      if (shouldRollback) {
        const savedState = loadState();
        await rollback(savedState);
      }

      return { success: false };
    }
  }

  // Re-run checks to verify
  console.log(chalk.cyan('\n🔍 Re-checking prerequisites...\n'));

  const [nodeResult, dockerResult, composeResult] = await Promise.all([
    checkNode(platform),
    checkDocker(platform),
    checkCompose(platform)
  ]);

  const newResults = {
    ...results,
    node: nodeResult,
    docker: dockerResult,
    compose: composeResult
  };

  displayResults(newResults);

  const allPassed = checkAllPassed(newResults);

  return { success: allPassed };
}
