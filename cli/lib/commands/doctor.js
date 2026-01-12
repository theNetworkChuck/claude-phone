import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import axios from 'axios';
import { loadConfig, configExists } from '../config.js';
import { checkDocker, getContainerStatus } from '../docker.js';
import { isServerRunning, getServerPid } from '../process-manager.js';
import { validateElevenLabsKey, validateOpenAIKey } from '../validators.js';
import { isReachable, checkClaudeApiServer as checkClaudeApiHealth } from '../network.js';
import { checkPort } from '../port-check.js';

/**
 * Check if Claude CLI is installed
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
async function checkClaudeCLI() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], {
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Extract version from output
        const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
        resolve({
          installed: true,
          version: versionMatch ? versionMatch[1] : 'unknown'
        });
      } else {
        resolve({
          installed: false,
          error: 'Claude CLI not found in PATH'
        });
      }
    });

    child.on('error', () => {
      resolve({
        installed: false,
        error: 'Claude CLI not found'
      });
    });
  });
}

/**
 * Check ElevenLabs API connectivity
 * @param {string} apiKey - ElevenLabs API key
 * @returns {Promise<{connected: boolean, error?: string}>}
 */
async function checkElevenLabsAPI(apiKey) {
  try {
    const result = await validateElevenLabsKey(apiKey);
    if (result.valid) {
      return { connected: true };
    } else {
      return { connected: false, error: result.error };
    }
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Check OpenAI API connectivity
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<{connected: boolean, error?: string}>}
 */
async function checkOpenAIAPI(apiKey) {
  try {
    const result = await validateOpenAIKey(apiKey);
    if (result.valid) {
      return { connected: true };
    } else {
      return { connected: false, error: result.error };
    }
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Check if voice-app container is running
 * @returns {Promise<{running: boolean, error?: string}>}
 */
async function checkVoiceApp() {
  const containers = await getContainerStatus();
  const voiceApp = containers.find(c => c.name.includes('voice-app'));

  if (!voiceApp) {
    return {
      running: false,
      error: 'Container not found'
    };
  }

  const isRunning = voiceApp.status.toLowerCase().includes('up') ||
                    voiceApp.status.toLowerCase().includes('running');

  if (!isRunning) {
    return {
      running: false,
      error: `Container status: ${voiceApp.status}`
    };
  }

  return { running: true };
}

/**
 * Check if claude-api-server is running
 * @param {number} port - Port to check
 * @returns {Promise<{running: boolean, pid?: number, healthy?: boolean, error?: string}>}
 */
async function checkClaudeAPIServer(port) {
  const running = await isServerRunning();

  if (!running) {
    return {
      running: false,
      error: 'Process not running'
    };
  }

  const pid = getServerPid();

  // Try HTTP health check
  try {
    const response = await axios.get(`http://localhost:${port}/health`, {
      timeout: 5000
    });

    if (response.status === 200) {
      return {
        running: true,
        pid,
        healthy: true
      };
    } else {
      return {
        running: true,
        pid,
        healthy: false,
        error: `Health check returned status ${response.status}`
      };
    }
  } catch (error) {
    return {
      running: true,
      pid,
      healthy: false,
      error: 'Health endpoint not responding'
    };
  }
}

/**
 * Doctor command - Run health checks
 * @returns {Promise<void>}
 */
export async function doctorCommand() {
  console.log(chalk.bold.cyan('\n🔍 Claude Phone Health Check\n'));

  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  → Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();
  const checks = [];
  let passedCount = 0;

  // Check deployment mode
  const isPiSplit = config.deployment && config.deployment.mode === 'pi-split';

  // Check 1: Docker
  const dockerSpinner = ora('Checking Docker...').start();
  const dockerResult = await checkDocker();
  if (dockerResult.installed && dockerResult.running) {
    dockerSpinner.succeed(chalk.green('Docker is running'));
    passedCount++;
  } else {
    dockerSpinner.fail(chalk.red(`Docker check failed: ${dockerResult.error}`));
    console.log(chalk.gray('  → Install Docker Desktop from https://www.docker.com/products/docker-desktop\n'));
  }
  checks.push({ name: 'Docker', passed: dockerResult.installed && dockerResult.running });

  // Check 2: Claude CLI
  const claudeSpinner = ora('Checking Claude CLI...').start();
  const claudeResult = await checkClaudeCLI();
  if (claudeResult.installed) {
    claudeSpinner.succeed(chalk.green(`Claude CLI installed (v${claudeResult.version})`));
    passedCount++;
  } else {
    claudeSpinner.fail(chalk.red(`Claude CLI not found: ${claudeResult.error}`));
    console.log(chalk.gray('  → Install Claude CLI: npm install -g @anthropic-ai/claude\n'));
  }
  checks.push({ name: 'Claude CLI', passed: claudeResult.installed });

  // Check 3: ElevenLabs API
  const elevenLabsSpinner = ora('Checking ElevenLabs API...').start();
  const elevenLabsResult = await checkElevenLabsAPI(config.api.elevenlabs.apiKey);
  if (elevenLabsResult.connected) {
    elevenLabsSpinner.succeed(chalk.green('ElevenLabs API connected'));
    passedCount++;
  } else {
    elevenLabsSpinner.fail(chalk.red(`ElevenLabs API failed: ${elevenLabsResult.error}`));
    console.log(chalk.gray('  → Check your API key in ~/.claude-phone/config.json\n'));
  }
  checks.push({ name: 'ElevenLabs API', passed: elevenLabsResult.connected });

  // Check 4: OpenAI API
  const openAISpinner = ora('Checking OpenAI API...').start();
  const openAIResult = await checkOpenAIAPI(config.api.openai.apiKey);
  if (openAIResult.connected) {
    openAISpinner.succeed(chalk.green('OpenAI API connected'));
    passedCount++;
  } else {
    openAISpinner.fail(chalk.red(`OpenAI API failed: ${openAIResult.error}`));
    console.log(chalk.gray('  → Check your API key in ~/.claude-phone/config.json\n'));
  }
  checks.push({ name: 'OpenAI API', passed: openAIResult.connected });

  // Check 5: Voice-app container
  const voiceAppSpinner = ora('Checking voice-app container...').start();
  const voiceAppResult = await checkVoiceApp();
  if (voiceAppResult.running) {
    voiceAppSpinner.succeed(chalk.green('Voice-app container running'));
    passedCount++;
  } else {
    voiceAppSpinner.fail(chalk.red(`Voice-app container not running: ${voiceAppResult.error}`));
    console.log(chalk.gray('  → Run "claude-phone start" to launch services\n'));
  }
  checks.push({ name: 'Voice-app container', passed: voiceAppResult.running });

  // Check 6: Claude API server
  if (isPiSplit) {
    // Pi-split mode: Check Mac IP reachability
    const macIpSpinner = ora('Checking Mac IP reachability...').start();
    const macIp = config.deployment.pi.macIp;
    const macReachable = await isReachable(macIp);

    if (macReachable) {
      macIpSpinner.succeed(chalk.green(`Mac IP reachable (${macIp})`));
      passedCount++;
    } else {
      macIpSpinner.fail(chalk.red(`Mac IP not reachable: ${macIp}`));
      console.log(chalk.gray('  → Check network connection between Pi and Mac\n'));
    }
    checks.push({ name: 'Mac IP reachability', passed: macReachable });

    // Check Claude API server on Mac
    const apiServerSpinner = ora('Checking Claude API server on Mac...').start();
    const apiUrl = `http://${macIp}:${config.server.claudeApiPort}`;
    const apiHealth = await checkClaudeApiHealth(apiUrl);

    if (apiHealth.healthy) {
      apiServerSpinner.succeed(chalk.green(`Claude API server healthy at ${apiUrl}`));
      passedCount++;
    } else {
      apiServerSpinner.fail(chalk.red(`Claude API server not responding`));
      console.log(chalk.gray(`  → Run "claude-phone api-server" on your Mac\n`));
    }
    checks.push({ name: 'Claude API server (Mac)', passed: apiHealth.healthy });

    // Check drachtio port availability
    const drachtioPort = config.deployment.pi.drachtioPort || 5060;
    const drachtioSpinner = ora(`Checking drachtio port ${drachtioPort}...`).start();
    const drachtioPortCheck = await checkPort(drachtioPort);

    if (drachtioPortCheck.inUse) {
      if (drachtioPort === 5080) {
        drachtioSpinner.succeed(chalk.green(`Port ${drachtioPort} in use (expected - drachtio running)`));
        passedCount++;
      } else {
        drachtioSpinner.warn(chalk.yellow(`Port ${drachtioPort} in use (may conflict)`));
        passedCount++; // Partial pass
      }
    } else {
      drachtioSpinner.succeed(chalk.green(`Port ${drachtioPort} available`));
      passedCount++;
    }
    checks.push({ name: `Drachtio port ${drachtioPort}`, passed: true });

  } else {
    // Standard mode: Check local Claude API server
    const apiServerSpinner = ora('Checking Claude API server...').start();
    const apiServerResult = await checkClaudeAPIServer(config.server.claudeApiPort);
    if (apiServerResult.running && apiServerResult.healthy) {
      apiServerSpinner.succeed(chalk.green(`Claude API server running (PID: ${apiServerResult.pid})`));
      passedCount++;
    } else if (apiServerResult.running && !apiServerResult.healthy) {
      apiServerSpinner.warn(chalk.yellow(`Claude API server running but unhealthy (PID: ${apiServerResult.pid})`));
      console.log(chalk.gray(`  → ${apiServerResult.error}\n`));
      passedCount++; // Count as partial pass
    } else {
      apiServerSpinner.fail(chalk.red(`Claude API server not running: ${apiServerResult.error}`));
      console.log(chalk.gray('  → Run "claude-phone start" to launch services\n'));
    }
    checks.push({ name: 'Claude API server', passed: apiServerResult.running });
  }

  // Summary
  console.log(chalk.bold(`\n${passedCount}/${checks.length} checks passed\n`));

  if (passedCount === checks.length) {
    console.log(chalk.green('✓ All systems operational!\n'));
    process.exit(0);
  } else if (passedCount > checks.length / 2) {
    console.log(chalk.yellow('⚠ Some issues detected. Review the failures above.\n'));
    process.exit(1);
  } else {
    console.log(chalk.red('✗ Multiple failures detected. Fix the issues above before using Claude Phone.\n'));
    process.exit(1);
  }
}
