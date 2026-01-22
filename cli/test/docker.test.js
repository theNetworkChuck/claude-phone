import { test } from 'node:test';
import assert from 'node:assert';
import { generateDockerCompose, generateEnvFile } from '../lib/docker.js';

test('docker compose generation', async (t) => {
  await t.test('generates compose with default port 5060 when no drachtioPort specified', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      }
    };

    const compose = generateDockerCompose(config);

    // Should use default port 5060 in drachtio command
    assert.ok(compose.includes('--contact "sip:*:5060;transport=tcp,udp"'),
      'Should use port 5060 by default');
  });

  await t.test('generates compose with port 5070 when drachtioPort is 5070', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5070
        }
      }
    };

    const compose = generateDockerCompose(config);

    // Should use port 5070 when specified in config
    assert.ok(compose.includes('--contact "sip:*:5070;transport=tcp,udp"'),
      'Should use port 5070 when Pi config specifies it');
  });

  await t.test('generates compose with port 5060 when drachtioPort explicitly set to 5060', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5060
        }
      }
    };

    const compose = generateDockerCompose(config);

    assert.ok(compose.includes('--contact "sip:*:5060;transport=tcp,udp"'),
      'Should use port 5060 when explicitly specified');
  });

  await t.test('preserves other compose settings when using custom port', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5070
        }
      }
    };

    const compose = generateDockerCompose(config);

    // Verify other settings remain intact
    assert.ok(compose.includes('network_mode: host'), 'Should use host networking');
    assert.ok(compose.includes('--sip-port 5080'), 'FreeSWITCH should use port 5080');
    assert.ok(compose.includes('--port 9022'), 'Drachtio should use port 9022');
    assert.ok(compose.includes('EXTERNAL_IP=192.168.1.50'), 'Should use configured external IP');
  });

  await t.test('generates env file with Mac API URL for pi-split mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openai: { apiKey: 'openai-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'pi-split',
        pi: {
          macIp: '192.168.1.100'
        }
      }
    };

    const envFile = generateEnvFile(config);

    // Should use Mac API URL instead of localhost
    assert.ok(envFile.includes('CLAUDE_API_URL=http://192.168.1.100:3333'),
      'Should use Mac API URL for pi-split mode');
    assert.ok(!envFile.includes('CLAUDE_API_URL=http://localhost:'),
      'Should not use localhost for pi-split mode');
  });

  await t.test('generates env file with localhost for standard mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openai: { apiKey: 'openai-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'standard'
      }
    };

    const envFile = generateEnvFile(config);

    // Should use localhost for standard mode
    assert.ok(envFile.includes('CLAUDE_API_URL=http://localhost:3333'),
      'Should use localhost for standard mode');
  });

  await t.test('generates env file with localhost for both mode (all-in-one)', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openai: { apiKey: 'openai-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'both'
      }
    };

    const envFile = generateEnvFile(config);

    // Should use localhost for both mode (all services on same machine)
    assert.ok(envFile.includes('CLAUDE_API_URL=http://localhost:3333'),
      'Should use localhost for both mode (all-in-one installation)');

    // Should NOT use any remote IP
    assert.ok(!envFile.includes('CLAUDE_API_URL=http://192.168.'),
      'Should not use remote IP for both mode');
  });

  await t.test('generates env file with remote API for voice-server mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openai: { apiKey: 'openai-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'voice-server',
        apiServerIp: '192.168.1.200'
      }
    };

    const envFile = generateEnvFile(config);

    // Voice server mode should use the remote API server IP, not localhost
    assert.ok(envFile.includes('CLAUDE_API_URL=http://192.168.1.200:3333'),
      'voice-server mode should use remote apiServerIp');

    assert.ok(!envFile.includes('CLAUDE_API_URL=http://localhost:'),
      'voice-server mode should NOT use localhost when apiServerIp is set');
  });
});
