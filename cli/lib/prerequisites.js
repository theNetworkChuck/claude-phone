import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if Docker is installed and accessible
 * @returns {Promise<object>} Prerequisite check result
 * @property {boolean} installed - True if Docker is available
 * @property {string} [version] - Docker version if installed
 * @property {string} [error] - Error message if check failed
 * @property {string} [installUrl] - Installation URL if not installed
 */
export async function checkDocker() {
  try {
    // Check if docker command exists
    const { stdout: whichOutput } = await execAsync('which docker');

    if (!whichOutput.trim()) {
      return {
        installed: false,
        installUrl: 'https://docs.docker.com/engine/install/'
      };
    }

    // Get Docker version
    const { stdout: versionOutput } = await execAsync('docker --version');
    const version = versionOutput.trim();

    return {
      installed: true,
      version: version
    };
  } catch (error) {
    // Docker not found or not executable
    return {
      installed: false,
      error: error.message,
      installUrl: 'https://docs.docker.com/engine/install/'
    };
  }
}

/**
 * Check if docker-compose or docker compose is available
 * @returns {Promise<object>} Prerequisite check result
 * @property {boolean} installed - True if compose is available
 * @property {string} [version] - Compose version if installed
 * @property {string} [method] - 'plugin' or 'standalone'
 * @property {string} [error] - Error message if check failed
 * @property {string} [installUrl] - Installation URL if not installed
 */
export async function checkDockerCompose() {
  // Try docker compose (plugin) first
  try {
    const { stdout } = await execAsync('docker compose version');
    const version = stdout.trim();

    return {
      installed: true,
      version: version,
      method: 'plugin'
    };
  } catch (pluginError) {
    // Plugin not found, try standalone docker-compose
    try {
      const { stdout } = await execAsync('docker-compose --version');
      const version = stdout.trim();

      return {
        installed: true,
        version: version,
        method: 'standalone'
      };
    } catch (standaloneError) {
      // Neither available
      return {
        installed: false,
        error: 'Neither docker compose nor docker-compose found',
        installUrl: 'https://docs.docker.com/compose/install/'
      };
    }
  }
}

/**
 * Check all prerequisites for Raspberry Pi deployment
 * @returns {Promise<Array>} Array of prerequisite check results
 */
export async function checkPiPrerequisites() {
  const checks = [];

  // Check Docker
  const dockerResult = await checkDocker();
  checks.push({
    name: 'Docker',
    installed: dockerResult.installed,
    version: dockerResult.version,
    error: dockerResult.error,
    installUrl: dockerResult.installUrl
  });

  // Check Docker Compose
  const composeResult = await checkDockerCompose();
  checks.push({
    name: 'Docker Compose',
    installed: composeResult.installed,
    version: composeResult.version,
    method: composeResult.method,
    error: composeResult.error,
    installUrl: composeResult.installUrl
  });

  return checks;
}
