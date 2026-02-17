import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the project root directory (where voice-app and claude-api-server live)
 * This resolves from the CLI package location, not process.cwd()
 *
 * Directory structure:
 *   claude-phone/           <- project root (returned)
 *   ├── cli/
 *   │   └── lib/
 *   │       └── utils.js    <- this file
 *   ├── voice-app/
 *   └── claude-api-server/
 *
 * @returns {string} Absolute path to project root
 */
export function getProjectRoot() {
  // utils.js is at cli/lib/utils.js
  // Project root is two levels up: cli/lib -> cli -> project root
  return path.resolve(__dirname, '..', '..');
}

/**
 * Get local IP address (best guess)
 * @returns {string} Local IP address or 'auto'
 */
export function getLocalIP() {
  const interfaces = os.networkInterfaces();

  // Look for non-internal IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and IPv6
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'auto';
}

/**
 * Check if Claude CLI is installed
 * @returns {Promise<boolean>}
 */
export async function isClaudeInstalled() {
  return new Promise((resolve) => {
    const check = spawn('which', ['claude']);
    check.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Check if Codex CLI is installed
 * @returns {Promise<boolean>}
 */
export async function isCodexInstalled() {
  return new Promise((resolve) => {
    const check = spawn('which', ['codex']);
    check.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Check if the selected assistant CLI is installed
 * @param {string} backend - 'claude' | 'codex' | 'chatgpt'
 * @returns {Promise<boolean>}
 */
export async function isAssistantCliInstalled(backend) {
  const b = String(backend || '').trim().toLowerCase();
  if (b === 'chatgpt') return true; // Uses OpenAI API directly, no local CLI dependency.
  if (b === 'codex') return isCodexInstalled();
  return isClaudeInstalled();
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format device config for display
 * @param {object} device - Device configuration
 * @returns {string} Formatted device info
 */
export function formatDevice(device) {
  return `${device.name} (ext ${device.extension})`;
}
