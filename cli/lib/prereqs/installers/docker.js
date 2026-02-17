import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { withSudo } from '../utils/sudo.js';
import { checkDocker } from '../checks/docker.js';

/**
 * Install Docker on Linux
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function installDocker(platform) {
  console.log(chalk.bold.cyan('\n📦 Docker Installation\n'));

  // Confirm installation
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Install Docker automatically?',
      default: false
    }
  ]);

  if (!confirmed) {
    showDockerManualInstructions(platform);
    return { success: false, cancelled: true };
  }

  // Route to platform-specific installer
  let result;

  switch (platform.packageManager) {
    case 'apt':
      result = await installDockerApt(platform);
      break;
    case 'dnf':
    case 'yum':
      result = await installDockerDnf(platform.packageManager);
      break;
    case 'pacman':
      result = await installDockerPacman();
      break;
    default:
      console.error(chalk.red(`\n❌ Unsupported package manager: ${platform.packageManager}`));
      showDockerManualInstructions(platform);
      return { success: false };
  }

  if (!result.success) {
    return result;
  }

  // Add user to docker group
  await addUserToDockerGroup();

  // Start Docker daemon
  await startDockerDaemon();

  // Verify installation
  console.log(chalk.cyan('\n✓ Verifying Docker installation...'));
  const check = await checkDocker(platform);

  if (check.passed) {
    console.log(chalk.green(`✓ Docker v${check.version} installed successfully\n`));
    console.log(chalk.yellow('⚠️  You may need to log out and back in for group changes to take effect.'));
    return { success: true };
  } else {
    console.error(chalk.red('\n❌ Docker installation verification failed'));
    return { success: false };
  }
}

/**
 * Install Docker on Ubuntu/Debian
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<{success: boolean}>}
 */
async function installDockerApt(platform) {
  console.log(chalk.cyan('\nInstalling Docker via apt...'));

  const dockerRepoDistro = platform?.distro === 'ubuntu' ? 'ubuntu' : 'debian';
  const dockerRepoBase = `https://download.docker.com/linux/${dockerRepoDistro}`;

  const commands = [
    // Install prerequisites
    'apt-get update',
    'apt-get install -y ca-certificates curl gnupg',

    // Add Docker GPG key
    'install -m 0755 -d /etc/apt/keyrings',
    `curl -fsSL ${dockerRepoBase}/gpg -o /etc/apt/keyrings/docker.asc`,
    'chmod a+r /etc/apt/keyrings/docker.asc',

    // Add Docker repository
    `sh -c 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] ${dockerRepoBase} $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list'`,

    // Install Docker
    'apt-get update',
    'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin'
  ];

  return await withSudo(commands);
}

/**
 * Install Docker on RHEL/Fedora
 * @param {string} packageManager - 'dnf' or 'yum'
 * @returns {Promise<{success: boolean}>}
 */
async function installDockerDnf(packageManager) {
  console.log(chalk.cyan(`\nInstalling Docker via ${packageManager}...`));

  const commands = [
    // Install prerequisites
    `${packageManager} install -y ${packageManager}-plugins-core`,

    // Add Docker repository
    `${packageManager} config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo`,

    // Install Docker
    `${packageManager} install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`
  ];

  return await withSudo(commands);
}

/**
 * Install Docker on Arch Linux
 * @returns {Promise<{success: boolean}>}
 */
async function installDockerPacman() {
  console.log(chalk.cyan('\nInstalling Docker via pacman...'));

  const commands = [
    'pacman -Sy --noconfirm docker docker-compose'
  ];

  return await withSudo(commands);
}

/**
 * Add current user to docker group
 * @returns {Promise<void>}
 */
async function addUserToDockerGroup() {
  try {
    const username = execSync('whoami', { encoding: 'utf-8' }).trim();

    console.log(chalk.cyan(`\nAdding user '${username}' to docker group...`));

    const commands = [
      'groupadd -f docker',
      `usermod -aG docker ${username}`
    ];

    await withSudo(commands, { skipConfirm: true });
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not add user to docker group'));
    console.log(chalk.gray('You may need to run: sudo usermod -aG docker $USER'));
  }
}

/**
 * Start Docker daemon
 * @returns {Promise<void>}
 */
async function startDockerDaemon() {
  try {
    console.log(chalk.cyan('\nStarting Docker daemon...'));

    // Try systemctl first
    try {
      execSync('systemctl --version', { stdio: 'pipe' });

      const commands = [
        'systemctl enable docker',
        'systemctl start docker'
      ];

      await withSudo(commands, { skipConfirm: true });
    } catch (e) {
      // Fall back to service command
      const commands = ['service docker start'];
      await withSudo(commands, { skipConfirm: true });
    }

    console.log(chalk.green('✓ Docker daemon started'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not start Docker daemon automatically'));
    console.log(chalk.gray('Try running: sudo systemctl start docker'));
  }
}

/**
 * Show manual installation instructions for Docker
 * @param {object} platform - Platform info
 * @returns {void}
 */
function showDockerManualInstructions(platform) {
  console.log(chalk.yellow('\n📋 Manual Docker Installation\n'));

  switch (platform.packageManager) {
    case 'apt':
      console.log(chalk.gray('For Ubuntu/Debian:\n'));
      console.log(chalk.cyan('  # Add Docker repository'));
      console.log(chalk.cyan('  curl -fsSL https://get.docker.com -o get-docker.sh'));
      console.log(chalk.cyan('  sudo sh get-docker.sh\n'));
      console.log(chalk.cyan('  # Add user to docker group'));
      console.log(chalk.cyan('  sudo usermod -aG docker $USER\n'));
      break;

    case 'dnf':
    case 'yum':
      console.log(chalk.gray('For RHEL/Fedora:\n'));
      console.log(chalk.cyan('  sudo dnf install docker-ce docker-ce-cli containerd.io'));
      console.log(chalk.cyan('  sudo systemctl start docker'));
      console.log(chalk.cyan('  sudo usermod -aG docker $USER\n'));
      break;

    case 'pacman':
      console.log(chalk.gray('For Arch Linux:\n'));
      console.log(chalk.cyan('  sudo pacman -Sy docker docker-compose'));
      console.log(chalk.cyan('  sudo systemctl start docker'));
      console.log(chalk.cyan('  sudo usermod -aG docker $USER\n'));
      break;

    default:
      console.log(chalk.gray('See: https://docs.docker.com/engine/install/\n'));
  }

  console.log(chalk.gray('After installation, log out and back in, then run "claude-phone setup" again.\n'));
}
