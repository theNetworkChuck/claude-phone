import os from 'os';
import { spawn } from 'child_process';

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
