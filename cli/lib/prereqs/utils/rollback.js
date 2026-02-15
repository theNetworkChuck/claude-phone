import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { checkNode } from '../checks/node.js';
import { checkDocker } from '../checks/docker.js';
import { checkCompose } from '../checks/compose.js';
import { getConfigDir } from '../../config.js';

/**
 * Get state file path
 * @returns {string} Path to state file
 */
function getStateFile() {
  const configDir = getConfigDir();

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  return path.join(configDir, 'prereq-state.json');
}

/**
 * Save current prerequisite state before making changes
 * @param {object} platform - Platform info
 * @returns {Promise<object>} Saved state
 */
export async function saveState(platform) {
  const state = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    platform: {
      os: platform.os,
      distro: platform.distro,
      arch: platform.arch
    },
    prereqs: {}
  };

  // Check Node.js
  try {
    const nodeCheck = await checkNode(platform);
    state.prereqs.node = {
      installed: nodeCheck.version !== null,
      version: nodeCheck.version,
      passed: nodeCheck.passed
    };
  } catch (error) {
    state.prereqs.node = {
      installed: false,
      version: null,
      error: error.message
    };
  }

  // Check Docker
  try {
    const dockerCheck = await checkDocker(platform);
    state.prereqs.docker = {
      installed: dockerCheck.version !== null,
      version: dockerCheck.version,
      passed: dockerCheck.passed
    };
  } catch (error) {
    state.prereqs.docker = {
      installed: false,
      version: null,
      error: error.message
    };
  }

  // Check Docker Compose
  try {
    const composeCheck = await checkCompose(platform);
    state.prereqs.compose = {
      installed: composeCheck.version !== null,
      version: composeCheck.version,
      variant: composeCheck.variant,
      passed: composeCheck.passed
    };
  } catch (error) {
    state.prereqs.compose = {
      installed: false,
      version: null,
      error: error.message
    };
  }

  // Save to file
  const stateFile = getStateFile();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });

  console.log(chalk.gray(`\n✓ Saved prerequisite state to ${stateFile}\n`));

  return state;
}

/**
 * Load saved prerequisite state
 * @returns {object|null} Saved state or null if not found
 */
export function loadState() {
  const stateFile = getStateFile();

  if (!fs.existsSync(stateFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(stateFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(chalk.yellow(`⚠️  Could not load state file: ${error.message}`));
    return null;
  }
}

/**
 * Show rollback information and instructions
 * @param {object} savedState - Previously saved state
 * @returns {void}
 */
export function showRollbackInfo(savedState) {
  console.log(chalk.yellow('\n📋 Previous State\n'));

  if (!savedState) {
    console.log(chalk.gray('No saved state found.\n'));
    return;
  }

  const date = new Date(savedState.timestamp);
  console.log(chalk.gray(`Saved: ${date.toLocaleString()}\n`));

  // Node.js
  if (savedState.prereqs.node) {
    const node = savedState.prereqs.node;
    if (node.installed) {
      console.log(chalk.cyan(`Node.js: v${node.version}`));
    } else {
      console.log(chalk.gray('Node.js: not installed'));
    }
  }

  // Docker
  if (savedState.prereqs.docker) {
    const docker = savedState.prereqs.docker;
    if (docker.installed) {
      console.log(chalk.cyan(`Docker: v${docker.version}`));
    } else {
      console.log(chalk.gray('Docker: not installed'));
    }
  }

  // Docker Compose
  if (savedState.prereqs.compose) {
    const compose = savedState.prereqs.compose;
    if (compose.installed) {
      console.log(chalk.cyan(`Docker Compose: v${compose.version} (${compose.variant})`));
    } else {
      console.log(chalk.gray('Docker Compose: not installed'));
    }
  }

  console.log('');
  console.log(chalk.yellow('⚠️  Automatic rollback is limited.'));
  console.log(chalk.gray('Package uninstallation may require manual intervention.'));
  console.log('');
}

/**
 * Attempt to rollback changes (limited functionality)
 * @param {object} savedState - Previously saved state
 * @returns {Promise<{success: boolean}>}
 */
export async function rollback(savedState) {
  console.log(chalk.yellow('\n🔄 Rollback\n'));

  if (!savedState) {
    console.log(chalk.red('No saved state found. Cannot rollback.\n'));
    return { success: false };
  }

  showRollbackInfo(savedState);

  console.log(chalk.yellow('Note: Rollback functionality is limited.'));
  console.log(chalk.yellow('You may need to manually uninstall packages.\n'));

  console.log(chalk.gray('Rollback suggestions:\n'));

  // Node.js rollback
  if (!savedState.prereqs.node.installed) {
    console.log(chalk.cyan('To remove Node.js:'));
    console.log(chalk.gray('  Ubuntu/Debian: sudo apt-get remove nodejs npm'));
    console.log(chalk.gray('  Fedora/RHEL: sudo dnf remove nodejs npm'));
    console.log(chalk.gray('  Arch: sudo pacman -R nodejs npm'));
    console.log(chalk.gray('  macOS: brew uninstall node@20\n'));
  }

  // Docker rollback
  if (!savedState.prereqs.docker.installed) {
    console.log(chalk.cyan('To remove Docker:'));
    console.log(chalk.gray('  Ubuntu/Debian: sudo apt-get remove docker-ce docker-ce-cli containerd.io'));
    console.log(chalk.gray('  Fedora/RHEL: sudo dnf remove docker-ce docker-ce-cli containerd.io'));
    console.log(chalk.gray('  Arch: sudo pacman -R docker'));
    console.log(chalk.gray('  macOS: Uninstall Docker Desktop from Applications\n'));
  }

  return { success: true };
}

/**
 * Clear saved state
 * @returns {void}
 */
export function clearState() {
  const stateFile = getStateFile();

  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
    console.log(chalk.gray('✓ Cleared prerequisite state\n'));
  }
}
