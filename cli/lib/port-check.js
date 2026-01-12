import net from 'net';

/**
 * Check if a port is in use
 * @param {number} port - Port number to check
 * @param {number} [timeout=1000] - Timeout in milliseconds
 * @returns {Promise<object>} Port check result
 * @property {number} port - Port that was checked
 * @property {boolean} inUse - True if port is in use
 */
export async function checkPort(port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    // Set timeout
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        port: port,
        inUse: false
      });
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({
        port: port,
        inUse: true
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();

      // ECONNREFUSED means nothing is listening on the port
      // EACCES means permission denied (port is in use but we can't connect)
      // EADDRINUSE means the port is in use
      if (err.code === 'ECONNREFUSED') {
        resolve({
          port: port,
          inUse: false
        });
      } else if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
        resolve({
          port: port,
          inUse: true
        });
      } else {
        // Unknown error, assume port is not available
        resolve({
          port: port,
          inUse: false,
          error: err.message
        });
      }
    });

    // Try to connect to the port
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Detect if 3CX SBC is running (checks port 5060)
 * @returns {Promise<boolean>} True if 3CX SBC detected (port 5060 in use)
 */
export async function detect3cxSbc() {
  const result = await checkPort(5060);
  return result.inUse;
}
