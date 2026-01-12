import os from 'os';
import fs from 'fs';

/**
 * Get Raspberry Pi model string from /proc/device-tree/model
 * @returns {Promise<string|null>} Pi model string or null if not Pi
 */
export async function getPiModel() {
  const modelPath = '/proc/device-tree/model';

  try {
    // Check if file exists
    if (!fs.existsSync(modelPath)) {
      return null;
    }

    // Read model file
    const data = await fs.promises.readFile(modelPath, 'utf8');

    // File contains null-terminated string, clean it
    const model = data.replace(/\0/g, '').trim();

    // Only return if it's actually a Raspberry Pi
    if (model.includes('Raspberry Pi')) {
      return model;
    }

    return null;
  } catch (error) {
    // If we can't read the file, we're not on a Pi
    return null;
  }
}

/**
 * Check if running on Raspberry Pi
 * @returns {Promise<boolean>} True if running on Raspberry Pi
 */
export async function isRaspberryPi() {
  // Pi detection requires:
  // 1. Linux platform
  // 2. ARM64 architecture
  // 3. Raspberry Pi model string in /proc/device-tree/model

  if (os.platform() !== 'linux') {
    return false;
  }

  if (os.arch() !== 'arm64') {
    return false;
  }

  const model = await getPiModel();
  return model !== null;
}

/**
 * Detect current platform and Raspberry Pi status
 * @returns {Promise<object>} Platform information
 * @property {string} os - Operating system (darwin, linux, win32)
 * @property {string} arch - CPU architecture (x64, arm64, arm)
 * @property {boolean} isPi - True if Raspberry Pi detected
 * @property {string} [piModel] - Pi model string if isPi is true
 */
export async function detectPlatform() {
  const platform = os.platform();
  const arch = os.arch();
  const isPi = await isRaspberryPi();

  const result = {
    os: platform,
    arch: arch,
    isPi: isPi
  };

  // Add Pi model if detected
  if (isPi) {
    const model = await getPiModel();
    if (model) {
      result.piModel = model;
    }
  }

  return result;
}
