import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPidPath, getConfigDir } from './config.js';

/**
 * Get the server PID from the PID file
 * @param {string} [pidPath] - Optional PID file path (for testing)
 * @returns {number|null} PID or null if not found
 */
export function getServerPid(pidPath = null) {
  pidPath = pidPath || getPidPath();

  if (!fs.existsSync(pidPath)) {
    return null;
  }

  try {
    const pidStr = fs.readFileSync(pidPath, 'utf8').trim();
    return parseInt(pidStr, 10);
  } catch (error) {
    return null;
  }
}

/**
 * Check if a process is running
 * @param {number} pid - Process ID
 * @returns {boolean} True if running
 */
function isProcessRunning(pid) {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if the server is running
 * @param {string} [pidPath] - Optional PID file path (for testing)
 * @returns {Promise<boolean>} True if running
 */
export async function isServerRunning(pidPath = null) {
  const pid = getServerPid(pidPath);

  if (!pid) {
    return false;
  }

  return isProcessRunning(pid);
}

/**
 * Start the claude-api-server
 * @param {string} serverPath - Path to claude-api-server directory
 * @param {number} port - Port to listen on
 * @param {string} [pidPath] - Optional PID file path (for testing)
 * @returns {Promise<number>} Process PID
 */
export async function startServer(serverPath, port, pidPath = null, envExtra = {}) {
  pidPath = pidPath || getPidPath();

  // Check if already running
  if (await isServerRunning(pidPath)) {
    const pid = getServerPid(pidPath);
    throw new Error(`Server already running (PID: ${pid})`);
  }

  return new Promise((resolve, reject) => {
    // Spawn detached process
    const child = spawn('node', ['server.js'], {
      cwd: serverPath,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: port,
        ...envExtra
      }
    });

    // Don't wait for child process
    child.unref();

    // Write PID file
    try {
      fs.writeFileSync(pidPath, child.pid.toString(), { mode: 0o600 });
      resolve(child.pid);
    } catch (error) {
      // Kill the child if we can't write PID file
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch (killError) {
        // Ignore kill errors
      }
      reject(new Error(`Failed to write PID file: ${error.message}`));
    }
  });
}

/**
 * Stop the claude-api-server
 * @param {string} [pidPath] - Optional PID file path (for testing)
 * @returns {Promise<void>}
 */
export async function stopServer(pidPath = null) {
  pidPath = pidPath || getPidPath();
  const pid = getServerPid(pidPath);

  if (!pid) {
    // Remove stale PID file if it exists
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
    }
    return;
  }

  if (!isProcessRunning(pid)) {
    // Process not running, remove PID file
    fs.unlinkSync(pidPath);
    return;
  }

  // Try graceful shutdown first
  try {
    process.kill(pid, 'SIGTERM');

    // Wait up to 5 seconds for graceful shutdown
    const startTime = Date.now();
    while (isProcessRunning(pid) && (Date.now() - startTime) < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
      process.kill(pid, 'SIGKILL');
      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    // Process might already be dead
  }

  // Remove PID file
  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}

/**
 * Save a PID file for a named service
 * @param {string} name - Service name (e.g., 'claude-api-server')
 * @param {number} pid - Process ID
 */
export function savePid(name, pid) {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  const pidFile = path.join(configDir, `${name}.pid`);
  fs.writeFileSync(pidFile, pid.toString(), { mode: 0o600 });
}

/**
 * Remove a PID file for a named service
 * @param {string} name - Service name (e.g., 'claude-api-server')
 */
export function removePid(name) {
  const configDir = getConfigDir();
  const pidFile = path.join(configDir, `${name}.pid`);
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}
