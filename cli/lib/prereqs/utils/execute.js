import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import { getConfigDir } from '../../config.js';

/**
 * Download a file from URL to local path
 * @param {string} url - URL to download from
 * @param {string} destPath - Destination file path
 * @returns {Promise<void>}
 */
export async function downloadFile(url, destPath) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 30000 // 30 second timeout
  });

  const writer = fs.createWriteStream(destPath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * Read first N lines from a file
 * @param {string} filePath - Path to file
 * @param {number} count - Number of lines to read
 * @returns {Promise<string>} File content (first N lines)
 */
export async function readLines(filePath, count) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const preview = lines.slice(0, count);

  return preview.join('\n');
}

/**
 * Show preview of a script file before execution
 * @param {string} filePath - Path to script file
 * @param {number} lineCount - Number of lines to preview (default: 50)
 * @returns {Promise<void>}
 */
export async function showPreview(filePath, lineCount = 50) {
  console.log(chalk.yellow('\n📄 Script preview (first 50 lines):'));
  console.log(chalk.gray('─'.repeat(60)));

  const preview = await readLines(filePath, lineCount);
  const lines = preview.split('\n');

  for (let i = 0; i < lines.length; i++) {
    console.log(chalk.gray(`${(i + 1).toString().padStart(4)} │ ${lines[i]}`));
  }

  if (lines.length === lineCount) {
    console.log(chalk.gray('     │ ... (truncated)'));
  }

  console.log(chalk.gray('─'.repeat(60)));
}

/**
 * Run a command with logging to file
 * @param {string} command - Command to run
 * @param {object} options - Execution options
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runWithLogging(command, options = {}) {
  const logFile = getLogFile();

  // Log command
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `\n[${timestamp}] Running: ${command}\n`);

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });

    // Log success
    fs.appendFileSync(logFile, `[${timestamp}] Success\n`);

    return {
      success: true,
      output
    };
  } catch (error) {
    // Log error
    fs.appendFileSync(logFile, `[${timestamp}] Error: ${error.message}\n`);

    if (error.stderr) {
      fs.appendFileSync(logFile, `[${timestamp}] stderr: ${error.stderr}\n`);
    }

    return {
      success: false,
      error: error.message,
      stderr: error.stderr
    };
  }
}

/**
 * Run a command and stream output in real-time
 * @param {string} command - Command to run
 * @param {Array<string>} args - Command arguments
 * @param {object} options - Spawn options
 * @returns {Promise<{success: boolean, code: number}>}
 */
export async function runWithStreaming(command, args = [], options = {}) {
  const logFile = getLogFile();
  const timestamp = new Date().toISOString();
  const fullCommand = `${command} ${args.join(' ')}`;

  fs.appendFileSync(logFile, `\n[${timestamp}] Running: ${fullCommand}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('close', (code) => {
      fs.appendFileSync(
        logFile,
        `[${timestamp}] Exited with code ${code}\n`
      );

      resolve({
        success: code === 0,
        code
      });
    });

    child.on('error', (error) => {
      fs.appendFileSync(logFile, `[${timestamp}] Error: ${error.message}\n`);
      reject(error);
    });
  });
}

/**
 * Download script to temp file, preview, confirm, and execute
 * @param {string} url - Script URL
 * @param {object} options - Execution options
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function executeScript(url, options = {}) {
  // 1. Download to temp file
  const tempFile = path.join(os.tmpdir(), `prereq_${Date.now()}.sh`);

  try {
    console.log(chalk.cyan(`\nDownloading script from ${url}...`));
    await downloadFile(url, tempFile);

    // 2. Show preview
    await showPreview(tempFile);

    // 3. Get confirmation (handled by caller)
    // The caller should confirm before calling executeScript

    // 4. Execute with logging
    const result = await runWithLogging(`bash ${tempFile}`, options);

    // 5. Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error) {
    // Clean up on error
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Get log file path
 * @returns {string} Path to log file
 */
function getLogFile() {
  const configDir = getConfigDir();

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  return path.join(configDir, 'prereq-install.log');
}
