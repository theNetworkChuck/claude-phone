import net from 'net';
import http from 'http';

/**
 * Check if an IP address is reachable on the network
 * @param {string} ip - IP address to check
 * @param {number} [timeout=3000] - Timeout in milliseconds
 * @returns {Promise<boolean>} True if IP is reachable
 */
export async function isReachable(ip, timeout = 3000) {
  return new Promise((resolve) => {
    // Validate IP format first
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      resolve(false);
      return;
    }

    const socket = new net.Socket();

    // Set timeout
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();

      // ECONNREFUSED means the IP is reachable but nothing is listening on that port
      // This is actually a GOOD sign - the IP responded
      if (err.code === 'ECONNREFUSED') {
        resolve(true);
      } else {
        // ETIMEDOUT, EHOSTUNREACH, etc. mean IP is not reachable
        resolve(false);
      }
    });

    // Try to connect to a common port (doesn't matter if nothing is listening)
    // We just want to know if the IP is reachable on the network
    // Port 80 is commonly used and not filtered by firewalls
    socket.connect(80, ip);
  });
}

/**
 * Check if claude-api-server is responding at a given URL
 * @param {string} url - Full URL to claude-api-server (e.g., http://192.168.1.100:3333)
 * @returns {Promise<object>} Check result
 * @property {boolean} reachable - True if server is reachable
 * @property {boolean} [healthy] - True if server responds with success (only if reachable)
 * @property {string} [error] - Error message if check failed
 */
export async function checkClaudeApiServer(url) {
  return new Promise((resolve) => {
    try {
      // Validate URL format
      // URL is a global in Node.js (no import needed)
      // eslint-disable-next-line no-undef, no-new
      new URL(url);

      // Try to reach /health endpoint (or root if /health doesn't exist)
      const healthUrl = url + '/health';

      const req = http.get(healthUrl, { timeout: 3000 }, (res) => {
        // Server is reachable
        const healthy = res.statusCode >= 200 && res.statusCode < 400;

        resolve({
          reachable: true,
          healthy: healthy,
          statusCode: res.statusCode
        });

        // Consume response to free up memory
        res.resume();
      });

      req.on('error', (err) => {
        // Connection error - server not reachable
        resolve({
          reachable: false,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          reachable: false,
          error: 'Connection timeout'
        });
      });
    } catch (err) {
      // Invalid URL format
      resolve({
        reachable: false,
        error: err.message
      });
    }
  });
}
