/**
 * Assistant HTTP API Server
 *
 * HTTP server that wraps assistant backends with session management
 * Runs on the API server to handle voice interface queries
 *
 * Usage:
 *   node server.js
 *
 * Endpoints:
 *   POST /ask - Send a prompt to selected backend (with optional callId for session)
 *   POST /end-session - Clean up session for a call
 *   GET /health - Health check
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildQueryContext,
  buildStructuredPrompt,
  tryParseJsonFromText,
  validateRequiredFields,
  buildRepairPrompt,
} = require('./structured');

const app = express();
const PORT = process.env.PORT || 3333;

/**
 * Backend selection.
 *
 * - "claude": wraps Claude Code CLI (default, backward compatible)
 * - "codex": wraps OpenAI Codex CLI (`codex exec`)
 * - "openai": uses OpenAI Responses API directly
 */
const RAW_BACKEND = String(process.env.AI_BACKEND || process.env.ASSISTANT_BACKEND || 'claude')
  .trim()
  .toLowerCase();

const BACKEND = RAW_BACKEND === 'chatgpt' ? 'openai' : RAW_BACKEND;
if (RAW_BACKEND === 'chatgpt') {
  console.warn('[STARTUP] "chatgpt" backend is deprecated; using "openai".');
}

const SUPPORTED_BACKENDS = new Set(['claude', 'codex', 'openai']);
if (!SUPPORTED_BACKENDS.has(BACKEND)) {
  throw new Error(
    `Unsupported backend "${BACKEND}". Supported: ${Array.from(SUPPORTED_BACKENDS).join(', ')}`
  );
}

function buildPathWithFallbacks(extraDirs = []) {
  const parts = [];
  for (const dir of extraDirs) parts.push(dir);
  if (process.env.PATH) parts.push(process.env.PATH);

  // Ensure some common fallback locations are always present.
  parts.push('/opt/homebrew/bin');
  parts.push('/usr/local/bin');
  parts.push('/usr/bin');
  parts.push('/bin');
  parts.push('/usr/sbin');
  parts.push('/sbin');

  const seen = new Set();
  const deduped = [];
  for (const segment of parts.join(':').split(':')) {
    const trimmed = String(segment || '').trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }
  return deduped.join(':');
}

/**
 * Build an environment that Claude Code expects.
 * This mimics what happens when you run `claude` in a terminal.
 */
function buildClaudeEnvironment() {
  const HOME = process.env.HOME || '/Users/networkchuck';
  const PAI_DIR = path.join(HOME, '.claude');

  // Load ~/.claude/.env (all API keys)
  const envPath = path.join(PAI_DIR, '.env');
  const paiEnv = {};
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          paiEnv[key] = valueParts.join('=');
        }
      }
    }
  }

  // Build PATH like zsh profile does
  const fullPath = buildPathWithFallbacks([
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/python@3.12/bin',
    '/opt/homebrew/opt/libpq/bin',
    path.join(HOME, '.bun/bin'),
    path.join(HOME, '.local/bin'),
    path.join(HOME, '.pyenv/bin'),
    path.join(HOME, '.pyenv/shims'),
    path.join(HOME, 'go/bin'),
    '/usr/local/go/bin',
    path.join(HOME, 'bin'),
    path.join(HOME, '.lmstudio/bin'),
    path.join(HOME, '.opencode/bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]);

  const env = {
    ...process.env,
    ...paiEnv,
    PATH: fullPath,
    HOME,
    PAI_DIR,
    PAI_HOME: HOME,
    DA: 'Morpheus',
    DA_COLOR: 'purple',
    GOROOT: '/usr/local/go',
    GOPATH: path.join(HOME, 'go'),
    PYENV_ROOT: path.join(HOME, '.pyenv'),
    BUN_INSTALL: path.join(HOME, '.bun'),
    // CRITICAL: These tell Claude Code it's running in the proper environment
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
  };

  // CRITICAL: Remove ANTHROPIC_API_KEY so Claude CLI uses subscription auth
  // If ANTHROPIC_API_KEY is set (even to placeholder), CLI tries API auth instead
  delete env.ANTHROPIC_API_KEY;

  return env;
}

function buildCodexEnvironment() {
  // Codex generally reads config from ~/.codex/config.toml and/or stored login.
  // We keep this environment lightweight and avoid clobbering PATH so "codex"
  // is found even when installed via nvm/npm.
  const HOME = process.env.HOME || '/Users/networkchuck';
  return {
    ...process.env,
    HOME,
    PATH: buildPathWithFallbacks([]),
  };
}

function buildOpenAIEnvironment() {
  return {
    ...process.env,
  };
}

// Pre-build the environment once at startup
const cliEnv = BACKEND === 'claude'
  ? buildClaudeEnvironment()
  : BACKEND === 'codex'
    ? buildCodexEnvironment()
    : buildOpenAIEnvironment();
console.log('[STARTUP] Backend:', BACKEND);
console.log('[STARTUP] Loaded environment with', Object.keys(cliEnv).length, 'variables');
console.log('[STARTUP] PATH includes:', String(cliEnv.PATH || '').split(':').slice(0, 5).join(', '), '...');

// Log which API keys are available (without showing values)
const apiKeys = Object.keys(cliEnv).filter(k =>
  k.includes('API_KEY') || k.includes('TOKEN') || k.includes('SECRET') || k === 'PAI_DIR'
);
console.log('[STARTUP] API keys loaded:', apiKeys.join(', '));

// Session storage: callId -> backend session identifier
const sessions = new Map();

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseCsvEnv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Model selection
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const CODEX_MODEL = (process.env.CODEX_MODEL || '').trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || process.env.CHATGPT_MODEL || 'gpt-5-mini').trim();
const OPENAI_WEB_SEARCH_ENABLED = parseBooleanEnv(
  process.env.OPENAI_WEB_SEARCH_ENABLED ?? process.env.OPENAI_WEB_SEARCH,
  true
);
const OPENAI_WEB_SEARCH_ALLOWED_TYPES = new Set([
  'web_search',
  'web_search_2025_08_26',
  'web_search_preview',
  'web_search_preview_2025_03_11'
]);
const OPENAI_WEB_SEARCH_TYPE_RAW = String(process.env.OPENAI_WEB_SEARCH_TYPE || 'web_search')
  .trim()
  .toLowerCase();
const OPENAI_WEB_SEARCH_TYPE = OPENAI_WEB_SEARCH_ALLOWED_TYPES.has(OPENAI_WEB_SEARCH_TYPE_RAW)
  ? OPENAI_WEB_SEARCH_TYPE_RAW
  : 'web_search';
const OPENAI_WEB_SEARCH_CONTEXT_SIZE = String(process.env.OPENAI_WEB_SEARCH_CONTEXT_SIZE || '')
  .trim()
  .toLowerCase();
const OPENAI_WEB_SEARCH_EXTERNAL_ACCESS = parseBooleanEnv(
  process.env.OPENAI_WEB_SEARCH_EXTERNAL_ACCESS,
  true
);
const OPENAI_WEB_SEARCH_DOMAINS = parseCsvEnv(
  process.env.OPENAI_WEB_SEARCH_DOMAINS || process.env.OPENAI_WEB_SEARCH_ALLOWED_DOMAINS
);
const OPENAI_WEB_SEARCH_LOCATION = {
  city: String(process.env.OPENAI_WEB_SEARCH_CITY || '').trim(),
  country: String(process.env.OPENAI_WEB_SEARCH_COUNTRY || '').trim(),
  region: String(process.env.OPENAI_WEB_SEARCH_REGION || '').trim(),
  timezone: String(process.env.OPENAI_WEB_SEARCH_TIMEZONE || '').trim(),
};

if (BACKEND === 'openai') {
  if (!OPENAI_WEB_SEARCH_ALLOWED_TYPES.has(OPENAI_WEB_SEARCH_TYPE_RAW)) {
    console.warn(
      `[STARTUP] Invalid OPENAI_WEB_SEARCH_TYPE="${OPENAI_WEB_SEARCH_TYPE_RAW}", falling back to "web_search".`
    );
  }
  console.log(
    '[STARTUP] OpenAI web search:',
    OPENAI_WEB_SEARCH_ENABLED ? `enabled (${OPENAI_WEB_SEARCH_TYPE})` : 'disabled'
  );
}

function parseClaudeStdout(stdout) {
  // Claude Code CLI may output JSONL; when it does, extract the `result` message.
  // Otherwise, fall back to raw stdout.
  let response = '';
  let sessionId = null;

  try {
    const lines = String(stdout || '').trim().split('\n');
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result' && parsed.result) {
          response = parsed.result;
          sessionId = parsed.session_id;
        }
      } catch {
        // Not JSONL; ignore.
      }
    }

    if (!response) response = String(stdout || '').trim();
  } catch {
    response = String(stdout || '').trim();
  }

  return { response, sessionId };
}

function runClaudeOnce({ fullPrompt, callId, timestamp }) {
  const startTime = Date.now();

  const args = [
    '--dangerously-skip-permissions',
    '-p', fullPrompt,
    '--model', CLAUDE_MODEL
  ];

  if (callId) {
    if (sessions.has(callId)) {
      args.push('--resume', callId);
      console.log(`[${timestamp}] Resuming session: ${callId}`);
    } else {
      args.push('--session-id', callId);
      sessions.set(callId, true);
      console.log(`[${timestamp}] Starting new session: ${callId}`);
    }
  }

  return new Promise((resolve, reject) => {
    const claude = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: cliEnv
    });

    let stdout = '';
    let stderr = '';

    claude.stdin.end();
    claude.stdout.on('data', (data) => { stdout += data.toString(); });
    claude.stderr.on('data', (data) => { stderr += data.toString(); });

    claude.on('error', (error) => {
      reject(error);
    });

    claude.on('close', (code) => {
      const duration_ms = Date.now() - startTime;
      resolve({ code, stdout, stderr, duration_ms });
    });
  });
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors.
  }
}

function runCodexOnce({ fullPrompt }) {
  const startTime = Date.now();
  const sandbox = String(process.env.CODEX_SANDBOX || 'workspace-write');
  const model = CODEX_MODEL;

  const outFile = path.join(
    os.tmpdir(),
    `codex-last-message-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );

  const args = [
    'exec',
    '--skip-git-repo-check',
    '--color', 'never',
    '--sandbox', sandbox,
    '--output-last-message', outFile,
  ];

  if (model) {
    args.push('-m', model);
  }

  // PROMPT as final arg.
  args.push(fullPrompt);

  return new Promise((resolve, reject) => {
    const codex = spawn('codex', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: cliEnv,
    });

    let stdout = '';
    let stderr = '';

    codex.stdin.end();
    codex.stdout.on('data', (data) => { stdout += data.toString(); });
    codex.stderr.on('data', (data) => { stderr += data.toString(); });

    codex.on('error', (error) => {
      safeUnlink(outFile);
      reject(error);
    });

    codex.on('close', (code) => {
      const duration_ms = Date.now() - startTime;
      let lastMessage = '';
      try {
        if (fs.existsSync(outFile)) lastMessage = fs.readFileSync(outFile, 'utf8').trim();
      } catch {
        // Ignore; fall back to stdout.
      } finally {
        safeUnlink(outFile);
      }

      resolve({ code, stdout, stderr, duration_ms, lastMessage });
    });
  });
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) return '';

  const parts = [];
  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function buildOpenAIWebSearchTool() {
  if (!OPENAI_WEB_SEARCH_ENABLED) return null;

  const tool = {
    type: OPENAI_WEB_SEARCH_TYPE,
  };

  if (['low', 'medium', 'high'].includes(OPENAI_WEB_SEARCH_CONTEXT_SIZE)) {
    tool.search_context_size = OPENAI_WEB_SEARCH_CONTEXT_SIZE;
  }

  if (OPENAI_WEB_SEARCH_TYPE.startsWith('web_search')) {
    if (OPENAI_WEB_SEARCH_TYPE === 'web_search' && !OPENAI_WEB_SEARCH_EXTERNAL_ACCESS) {
      tool.external_web_access = false;
    }

    // Domain filtering is currently documented for the GA web_search tool.
    if (OPENAI_WEB_SEARCH_TYPE === 'web_search' && OPENAI_WEB_SEARCH_DOMAINS.length > 0) {
      tool.filters = {
        allowed_domains: OPENAI_WEB_SEARCH_DOMAINS,
      };
    }
  }

  const hasLocation =
    OPENAI_WEB_SEARCH_LOCATION.city ||
    OPENAI_WEB_SEARCH_LOCATION.country ||
    OPENAI_WEB_SEARCH_LOCATION.region ||
    OPENAI_WEB_SEARCH_LOCATION.timezone;

  if (hasLocation) {
    tool.user_location = {
      type: 'approximate',
      ...(OPENAI_WEB_SEARCH_LOCATION.city ? { city: OPENAI_WEB_SEARCH_LOCATION.city } : {}),
      ...(OPENAI_WEB_SEARCH_LOCATION.country ? { country: OPENAI_WEB_SEARCH_LOCATION.country } : {}),
      ...(OPENAI_WEB_SEARCH_LOCATION.region ? { region: OPENAI_WEB_SEARCH_LOCATION.region } : {}),
      ...(OPENAI_WEB_SEARCH_LOCATION.timezone ? { timezone: OPENAI_WEB_SEARCH_LOCATION.timezone } : {}),
    };
  }

  return tool;
}

function shouldRetryWithoutWebSearch(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  if (!msg) return false;
  const mentionsWebSearch = msg.includes('web_search') || msg.includes('tools[0].type');
  const looksUnsupported =
    msg.includes('unsupported') ||
    msg.includes('not supported') ||
    msg.includes('unknown') ||
    msg.includes('invalid');
  return mentionsWebSearch && looksUnsupported;
}

async function callOpenAIResponses(apiKey, payload) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const rawBody = await response.text();

  let data = null;
  try {
    data = JSON.parse(rawBody);
  } catch {
    // Leave as null; caller can fall back to raw text.
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      rawBody,
      data,
      errorMessage: data?.error?.message || rawBody || `OpenAI API HTTP ${response.status}`
    };
  }

  return { ok: true, status: response.status, rawBody, data };
}

async function runOpenAIOnce({ fullPrompt, callId, timestamp }) {
  const startTime = Date.now();
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (!apiKey) {
    return {
      code: 1,
      stdout: '',
      stderr: 'OPENAI_API_KEY is not set',
      duration_ms: Date.now() - startTime,
      response: '',
      sessionId: null
    };
  }

  const payload = {
    model: OPENAI_MODEL,
    input: fullPrompt
  };
  const webSearchTool = buildOpenAIWebSearchTool();
  if (webSearchTool) {
    payload.tools = [webSearchTool];
  }

  if (callId && sessions.has(callId)) {
    payload.previous_response_id = sessions.get(callId);
    console.log(`[${timestamp}] Resuming response chain: ${sessions.get(callId)}`);
  }

  try {
    let apiResult = await callOpenAIResponses(apiKey, payload);

    if (!apiResult.ok && webSearchTool && shouldRetryWithoutWebSearch(apiResult.errorMessage)) {
      console.warn(
        `[${timestamp}] OpenAI web search tool rejected (${apiResult.errorMessage}). Retrying without web search.`
      );
      const fallbackPayload = { ...payload };
      delete fallbackPayload.tools;
      apiResult = await callOpenAIResponses(apiKey, fallbackPayload);
    }

    const duration_ms = Date.now() - startTime;
    if (!apiResult.ok) {
      return {
        code: apiResult.status || 1,
        stdout: apiResult.rawBody,
        stderr: apiResult.errorMessage,
        duration_ms,
        response: '',
        sessionId: null
      };
    }

    const parsedText = extractOpenAIText(apiResult.data);
    const responseText = parsedText || String(apiResult.rawBody || '').trim();

    return {
      code: 0,
      stdout: apiResult.rawBody,
      stderr: '',
      duration_ms,
      response: responseText,
      sessionId: apiResult.data?.id || null
    };
  } catch (error) {
    return {
      code: 1,
      stdout: '',
      stderr: error.message,
      duration_ms: Date.now() - startTime,
      response: '',
      sessionId: null
    };
  }
}

async function runBackendOnce({ fullPrompt, callId, timestamp }) {
  if (BACKEND === 'claude') {
    const { code, stdout, stderr, duration_ms } = await runClaudeOnce({ fullPrompt, callId, timestamp });
    const { response, sessionId } = parseClaudeStdout(stdout);
    return { code, stdout, stderr, duration_ms, response, sessionId };
  }

  if (BACKEND === 'codex') {
    const { code, stdout, stderr, duration_ms, lastMessage } = await runCodexOnce({ fullPrompt, callId, timestamp });
    const response = (lastMessage || String(stdout || '').trim());
    return { code, stdout, stderr, duration_ms, response, sessionId: null };
  }

  const openaiResult = await runOpenAIOnce({ fullPrompt, callId, timestamp });
  return openaiResult;
}

/**
 * Voice Context - Prepended to all voice queries
 *
 * This tells Claude how to handle voice-specific patterns:
 * - Output VOICE_RESPONSE for TTS (conversational, 40 words max)
 * - Output COMPLETED for status logging (12 words max)
 * - For Slack delivery requests: do the work, send to Slack, then acknowledge
 */
const VOICE_CONTEXT = `[VOICE CALL CONTEXT]
This query comes via voice call. You MUST include BOTH of these lines in your response:

🗣️ VOICE_RESPONSE: [Your conversational answer in 40 words or less. This is what gets spoken aloud via TTS. Be natural and helpful, like talking to a friend.]

🎯 COMPLETED: [Status summary in 12 words or less. This is for logging only.]

IMPORTANT: The VOICE_RESPONSE line is what the caller HEARS. Make it conversational and complete - don't just say "Done" or "Task completed". Actually answer their question or confirm what you did in a natural way.

SLACK DELIVERY: When the caller requests delivery to Slack (phrases like "send to Slack", "post to #channel", "message me when done"):
1. Do the requested work (research, generate content, analyze, etc.)
2. Send results to the specified Slack channel using the Slack skill
3. Include a VOICE_RESPONSE like: "Done! I sent the weather info to the 508 channel."

The caller may hang up while you're working (they'll hear hold music). That's fine - complete the work and send to Slack. They'll see it there.

Example query: "What's the weather in Royce City?"
Example response:
🗣️ VOICE_RESPONSE: It's 65 degrees and partly cloudy in Royce City right now. Great weather for being outside!
🎯 COMPLETED: Weather lookup for Royce City done.
[END VOICE CONTEXT]

`;

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

/**
 * POST /ask
 *
 * Request body:
 *   {
 *     "prompt": "What Docker containers are running?",
 *     "callId": "optional-call-uuid",
 *     "devicePrompt": "optional device-specific prompt"
 *   }
 *
 * Response:
 *   { "success": true, "response": "...", "duration_ms": 1234, "sessionId": "..." }
 *
 * Session Management:
 *   - If callId is provided and we have a stored session, uses --resume
 *   - First query for a callId captures the session_id for future turns
 *   - This maintains conversation context across multiple turns in a phone call
 *
 * Device Prompts:
 *   - If devicePrompt is provided, it's prepended before VOICE_CONTEXT
 *   - This allows each device (NAS, Proxmox, etc.) to have its own identity and skills
 */
app.post('/ask', async (req, res) => {
  const { prompt, callId, devicePrompt } = req.body;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing prompt in request body'
    });
  }

  // Check if we have an existing session for this call
  const existingSession = callId ? sessions.get(callId) : null;

  console.log(`[${timestamp}] QUERY: "${prompt.substring(0, 100)}..."`);
  console.log(`[${timestamp}] BACKEND: ${BACKEND}`);
  if (BACKEND === 'claude') console.log(`[${timestamp}] MODEL: ${CLAUDE_MODEL}`);
  if (BACKEND === 'codex') console.log(`[${timestamp}] MODEL: ${CODEX_MODEL || 'codex-default'}`);
  if (BACKEND === 'openai') console.log(`[${timestamp}] MODEL: ${OPENAI_MODEL}`);
  if (BACKEND === 'openai') {
    console.log(
      `[${timestamp}] WEB_SEARCH: ${
        OPENAI_WEB_SEARCH_ENABLED ? `enabled (${OPENAI_WEB_SEARCH_TYPE})` : 'disabled'
      }`
    );
  }
  console.log(`[${timestamp}] SESSION: callId=${callId || 'none'}, existing=${existingSession || 'none'}`);
  console.log(`[${timestamp}] DEVICE PROMPT: ${devicePrompt ? 'Yes (' + devicePrompt.substring(0, 30) + '...)' : 'No'}`);

  try {
    /**
     * Prompt layering order:
     * 1. Device prompt (if provided) - identity and available skills
     * 2. VOICE_CONTEXT - general voice call instructions
     * 3. User's prompt - what they actually said
     */
    let fullPrompt = '';

    if (devicePrompt) {
      fullPrompt += `[DEVICE IDENTITY]\n${devicePrompt}\n[END DEVICE IDENTITY]\n\n`;
    }

    fullPrompt += VOICE_CONTEXT;
    fullPrompt += prompt;

    const { code, stdout, stderr, duration_ms, response, sessionId } = await runBackendOnce({
      fullPrompt,
      callId,
      timestamp
    });

    if (code !== 0) {
      console.error(`[${new Date().toISOString()}] ERROR: Backend CLI exited with code ${code}`);
      console.error(`STDERR: ${stderr}`);
      console.error(`STDOUT: ${stdout.substring(0, 500)}`);
      const errorMsg = stderr || stdout || `Exit code ${code}`;
      return res.json({ success: false, error: `${BACKEND} backend failed: ${errorMsg}`, duration_ms });
    }

    if (sessionId && callId) {
      sessions.set(callId, sessionId);
      console.log(`[${new Date().toISOString()}] SESSION STORED: ${callId} -> ${sessionId}`);
    }

    console.log(`[${new Date().toISOString()}] RESPONSE (${duration_ms}ms): "${response.substring(0, 100)}..."`);

    res.json({ success: true, response, sessionId, duration_ms });

  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`[${timestamp}] ERROR:`, error.message);

    res.json({
      success: false,
      error: error.message,
      duration_ms
    });
  }
});

/**
 * POST /ask-structured
 *
 * Like /ask, but returns machine-validated JSON for n8n automations.
 *
 * Request body:
 *   {
 *     "prompt": "Check Ceph health",
 *     "callId": "optional-call-uuid",
 *     "devicePrompt": "optional device-specific prompt",
 *     "schema": {
 *        "queryType": "ceph_health",
 *        "requiredFields": ["cluster_status","ssd_usage_percent","recommendation"],
 *        "fieldGuidance": { "cluster_status": "Ceph overall health, e.g. HEALTH_OK/HEALTH_WARN/HEALTH_ERR" },
 *        "allowExtraFields": true,
 *        "example": { "cluster_status": "HEALTH_WARN", "ssd_usage_percent": 88, "recommendation": "alert" }
 *     },
 *     "includeVoiceContext": false,
 *     "maxRetries": 1
 *   }
 *
 * Response (success):
 *   { "success": true, "data": {...}, "raw_response": "...", "duration_ms": 1234 }
 */
app.post('/ask-structured', async (req, res) => {
  const {
    prompt,
    callId,
    devicePrompt,
    schema = {},
    includeVoiceContext = false,
    maxRetries = 1,
  } = req.body || {};

  const timestamp = new Date().toISOString();

  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Missing prompt in request body' });
  }

  const queryContext = buildQueryContext({
    queryType: schema.queryType,
    requiredFields: schema.requiredFields,
    fieldGuidance: schema.fieldGuidance,
    allowExtraFields: schema.allowExtraFields !== false,
    example: schema.example,
  });

  let fullPrompt = buildStructuredPrompt({
    devicePrompt,
    queryContext: (includeVoiceContext ? VOICE_CONTEXT : '') + queryContext,
    userPrompt: prompt,
  });

  console.log(`[${timestamp}] STRUCTURED QUERY: "${String(prompt).substring(0, 100)}..."`);
  console.log(`[${timestamp}] BACKEND: ${BACKEND}`);
  if (BACKEND === 'claude') console.log(`[${timestamp}] MODEL: ${CLAUDE_MODEL}`);
  if (BACKEND === 'codex') console.log(`[${timestamp}] MODEL: ${CODEX_MODEL || 'codex-default'}`);
  if (BACKEND === 'openai') console.log(`[${timestamp}] MODEL: ${OPENAI_MODEL}`);
  if (BACKEND === 'openai') {
    console.log(
      `[${timestamp}] WEB_SEARCH: ${
        OPENAI_WEB_SEARCH_ENABLED ? `enabled (${OPENAI_WEB_SEARCH_TYPE})` : 'disabled'
      }`
    );
  }
  console.log(`[${timestamp}] SESSION: callId=${callId || 'none'}, existing=${callId ? (sessions.has(callId) ? 'yes' : 'no') : 'none'}`);

  try {
    let lastRaw = '';
    let lastError = 'Unknown error';
    let totalDuration = 0;
    const retries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 0;
    let attemptsMade = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      attemptsMade = attempt + 1;
      const run = await runBackendOnce({ fullPrompt, callId, timestamp });
      totalDuration += run.duration_ms;

      if (run.code !== 0) {
        lastError = `${BACKEND} backend failed: ${run.stderr}`;
        lastRaw = String(run.stdout || '').trim();
        return res.status(502).json({
          success: false,
          error: lastError,
          raw_response: lastRaw,
          duration_ms: totalDuration,
          attempts: attemptsMade,
        });
      }

      lastRaw = run.response;
      if (run.sessionId && callId) sessions.set(callId, run.sessionId);

      const parsed = tryParseJsonFromText(lastRaw);
      if (!parsed.ok) {
        lastError = parsed.error || 'Failed to parse JSON';
      } else {
        const validation = validateRequiredFields(parsed.data, schema.requiredFields);
        if (validation.ok) {
          return res.json({
            success: true,
            data: parsed.data,
            json_text: parsed.jsonText,
            raw_response: lastRaw,
            duration_ms: totalDuration,
            attempts: attemptsMade,
          });
        }
        lastError = validation.error || 'Validation failed';
      }

      if (attempt >= retries) break;

      // Retry once with a repair prompt that forces "JSON only" formatting.
      const repairPrompt = buildRepairPrompt({
        queryType: schema.queryType,
        requiredFields: schema.requiredFields,
        fieldGuidance: schema.fieldGuidance,
        allowExtraFields: schema.allowExtraFields !== false,
        originalUserPrompt: prompt,
        invalidAssistantOutput: lastRaw,
        example: schema.example,
      });

      fullPrompt = buildStructuredPrompt({
        devicePrompt,
        queryContext: includeVoiceContext ? VOICE_CONTEXT : '',
        userPrompt: repairPrompt,
      });
    }

    return res.status(422).json({
      success: false,
      error: lastError,
      raw_response: lastRaw,
      duration_ms: totalDuration,
      attempts: attemptsMade,
    });
  } catch (error) {
    console.error(`[${timestamp}] ERROR:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /end-session
 *
 * Clean up session when a call ends
 *
 * Request body:
 *   { "callId": "call-uuid" }
 */
app.post('/end-session', (req, res) => {
  const { callId } = req.body;
  const timestamp = new Date().toISOString();

  if (callId && sessions.has(callId)) {
    sessions.delete(callId);
    console.log(`[${timestamp}] SESSION ENDED: ${callId}`);
  }

  res.json({ success: true });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'claude-api-server',
    backend: BACKEND,
    openai: BACKEND === 'openai'
      ? {
        model: OPENAI_MODEL,
        webSearchEnabled: OPENAI_WEB_SEARCH_ENABLED,
        webSearchType: OPENAI_WEB_SEARCH_TYPE
      }
      : undefined,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Assistant HTTP API Server',
    version: '1.0.0',
    backend: BACKEND,
    endpoints: {
      'POST /ask': 'Send a prompt to the assistant backend',
      'POST /ask-structured': 'Send a prompt and return validated JSON (n8n)',
      'GET /health': 'Health check'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(64));
  console.log('Assistant HTTP API Server');
  console.log('='.repeat(64));
  console.log(`\nListening on: http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('\nReady to receive assistant queries from voice interface.\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});
