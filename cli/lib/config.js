import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Get the config directory path
 * @returns {string} Path to ~/.claude-phone
 */
export function getConfigDir() {
  return path.join(os.homedir(), '.claude-phone');
}

/**
 * Get the config file path
 * @returns {string} Path to ~/.claude-phone/config.json
 */
export function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Check if config file exists
 * @returns {boolean} True if config exists
 */
export function configExists() {
  return fs.existsSync(getConfigPath());
}

/**
 * Load configuration from disk
 * @returns {Promise<object>} Configuration object
 */
export async function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error('Configuration not found. Run "claude-phone setup" first.');
  }

  const data = await fs.promises.readFile(configPath, 'utf8');
  return JSON.parse(data);
}

/**
 * Save configuration to disk
 * @param {object} config - Configuration object
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // Create directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    await fs.promises.mkdir(configDir, { recursive: true, mode: 0o700 });
  }

  // Write config file
  const data = JSON.stringify(config, null, 2);
  await fs.promises.writeFile(configPath, data, { mode: 0o600 });
}

/**
 * Get the PID file path
 * @returns {string} Path to server.pid
 */
export function getPidPath() {
  return path.join(getConfigDir(), 'server.pid');
}

/**
 * Get the docker-compose.yml path
 * @returns {string} Path to generated docker-compose.yml
 */
export function getDockerComposePath() {
  return path.join(getConfigDir(), 'docker-compose.yml');
}

/**
 * Get the .env file path
 * @returns {string} Path to generated .env
 */
export function getEnvPath() {
  return path.join(getConfigDir(), '.env');
}
