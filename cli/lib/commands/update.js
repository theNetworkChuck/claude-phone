import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, configExists, getConfigDir } from '../config.js';

/**
 * Check for git repository
 * @param {string} projectRoot - Root directory of claude-phone
 * @returns {boolean} True if git repo
 */
function isGitRepo(projectRoot) {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: projectRoot,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git branch
 * @param {string} projectRoot - Root directory of claude-phone
 * @returns {string} Branch name
 */
function getCurrentBranch(projectRoot) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get project root directory (where package.json is)
 * @returns {string} Project root path
 */
function getProjectRoot() {
  // CLI is in cli/lib/commands/, project root is three levels up
  const currentFile = fileURLToPath(import.meta.url);
  const commandsDir = path.dirname(currentFile);
  const libDir = path.dirname(commandsDir);
  const cliDir = path.dirname(libDir);
  const projectRoot = path.dirname(cliDir);
  return fs.realpathSync(projectRoot);
}

/**
 * Fetch latest release info from GitHub
 * @returns {Promise<object>} Release info
 */
async function fetchLatestRelease() {
  try {
    const response = await fetch(
      'https://api.github.com/repos/networkchuck/claude-phone/releases/latest',
      {
        headers: {
          'User-Agent': 'claude-phone-cli',
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch latest release: ${error.message}`);
  }
}

/**
 * Update via git pull
 * @param {string} projectRoot - Root directory
 * @returns {Promise<void>}
 */
async function updateViaGit(projectRoot) {
  console.log(chalk.bold('\nUpdating from git...\n'));

  try {
    // Check current branch
    const branch = getCurrentBranch(projectRoot);
    console.log(chalk.gray(`Current branch: ${branch}`));

    // Fetch latest
    console.log(chalk.gray('Fetching latest changes...'));
    execSync('git fetch origin', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    // Check for uncommitted changes
    const status = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8'
    });

    if (status.trim()) {
      console.log(chalk.yellow('\n⚠️  You have uncommitted changes:'));
      console.log(chalk.gray(status));
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Continue with update? (changes will be stashed)',
          default: false
        }
      ]);

      if (!proceed) {
        console.log(chalk.gray('\n✗ Update cancelled\n'));
        return;
      }

      // Stash changes
      execSync('git stash', { cwd: projectRoot, stdio: 'inherit' });
      console.log(chalk.green('✓ Changes stashed'));
    }

    // Pull latest
    console.log(chalk.gray('\nPulling latest changes...'));
    execSync('git pull origin main', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    console.log(chalk.green('\n✓ Update complete\n'));
    console.log(chalk.gray('Run "claude-phone status" to verify services\n'));
  } catch (error) {
    throw new Error(`Git update failed: ${error.message}`);
  }
}

/**
 * Show manual update instructions
 * @param {object} release - Latest release info
 * @returns {void}
 */
function showManualInstructions(release) {
  console.log(chalk.bold('\n📥 Manual Update Instructions\n'));
  console.log(chalk.gray('Latest version:'), chalk.bold(release.tag_name));
  console.log(chalk.gray('Released:'), release.published_at.split('T')[0]);
  console.log();

  console.log(chalk.bold('To update manually:\n'));
  console.log(chalk.gray('1. Stop all services:'));
  console.log(chalk.bold('   claude-phone stop\n'));

  console.log(chalk.gray('2. Backup your configuration:'));
  console.log(chalk.bold('   cp $(claude-phone config path) ~/config.json.backup\n'));

  console.log(chalk.gray('3. Run the installer:'));
  console.log(chalk.bold('   curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash\n'));

  console.log(chalk.gray('4. Start services:'));
  console.log(chalk.bold('   claude-phone start\n'));

  console.log(chalk.yellow('⚠️  Your configuration will be preserved automatically\n'));
}

/**
 * Update command - Update Claude Phone to latest version
 * @returns {Promise<void>}
 */
export async function updateCommand() {
  console.log(chalk.bold.cyan('\n🔄 Update Claude Phone\n'));

  const projectRoot = getProjectRoot();

  // Backup config before update
  if (configExists()) {
    console.log(chalk.gray('Backing up configuration...'));
    const config = await loadConfig();
    const configDir = getConfigDir();
    const backupPath = `${configDir}/config.json.pre-update`;
    await saveConfig(config); // This creates a backup automatically
    console.log(chalk.green(`✓ Config backed up to: ${backupPath}`));
  }

  // Check if git repo
  if (isGitRepo(projectRoot)) {
    console.log(chalk.gray('Detected git installation\n'));
    await updateViaGit(projectRoot);
  } else {
    // Non-git installation - show manual instructions
    console.log(chalk.gray('Checking for latest release...\n'));

    try {
      const release = await fetchLatestRelease();
      showManualInstructions(release);
    } catch (error) {
      console.log(chalk.red(`\n✗ ${error.message}\n`));
      console.log(chalk.gray('Visit https://github.com/networkchuck/claude-phone for manual update\n'));
    }
  }
}
