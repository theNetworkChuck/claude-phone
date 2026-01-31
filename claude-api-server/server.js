/**
 * Claude HTTP API Server (OpenRouter-ready)
 *
 * Works on Windows, macOS, Linux. Use PowerShell or Bash to set:
 * $env:OPENROUTER_API_KEY="sk-xxxx-your-key"
 *
 * Usage:
 *   node server.js
 *
 * Endpoints:
 *   POST /ask - Send a prompt to Claude (with optional callId for session)
 *   POST /end-session - Clean up session for a call
 *   GET /health - Health check
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  buildQueryContext,
  buildStructuredPrompt,
  tryParseJsonFromText,
  validateRequiredFields,
  buildRepairPrompt,
} = require('./structured');

// Modern fetch for CommonJS in Node 22+
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3333;

// ==== Load environment & API key ====
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn(
    '[WARNING] OPENROUTER_API_KEY is not set. Set it in PowerShell: $env:OPENROUTER_API_KEY="sk-xxxx"'
  );
}

// Session storage
const sessions = new Map();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'anthropic/claude-3.5-sonnet';

// Voice context
const VOICE_CONTEXT = `[VOICE CALL CONTEXT]
🗣️ VOICE_RESPONSE: Answer conversationally in 40 words max.
🎯 COMPLETED: Status summary in 12 words max.
[END VOICE CONTEXT]
`;

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ==== Helpers ====
async function runOpenRouterPrompt(prompt, callId) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const payload = {
    model: CLAUDE_MODEL,
    messages: [{ role: 'user', content: prompt }],
  };

  const response = await fetch('https://api.openrouter.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // OpenRouter response format
  const result = data?.choices?.[0]?.message?.content || '';
  return { response: result, sessionId: callId || null };
}

// ==== Routes ====
app.post('/ask', async (req, res) => {
  const { prompt, callId, devicePrompt } = req.body || {};
  if (!prompt) return res.status(400).json({ success: false, error: 'Missing prompt' });

  let fullPrompt = '';
  if (devicePrompt) fullPrompt += `[DEVICE]\n${devicePrompt}\n[END DEVICE]\n\n`;
  fullPrompt += VOICE_CONTEXT + prompt;

  try {
    const { response, sessionId } = await runOpenRouterPrompt(fullPrompt, callId);

    if (sessionId && callId) sessions.set(callId, sessionId);

    res.json({ success: true, response, sessionId });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/ask-structured', async (req, res) => {
  const { prompt, callId, devicePrompt, schema = {}, includeVoiceContext = false, maxRetries = 1 } =
    req.body || {};

  if (!prompt) return res.status(400).json({ success: false, error: 'Missing prompt' });

  const queryContext = buildQueryContext({
    queryType: schema.queryType,
    requiredFields: schema.requiredFields,
    fieldGuidance: schema.fieldGuidance,
    allowExtraFields: schema.allowExtraFields !== false,
    example: schema.example,
  });

  let fullPrompt = buildStructuredPrompt({
    devicePrompt,
    queryContext: includeVoiceContext ? VOICE_CONTEXT + queryContext : queryContext,
    userPrompt: prompt,
  });

  try {
    const { response, sessionId } = await runOpenRouterPrompt(fullPrompt, callId);
    if (sessionId && callId) sessions.set(callId, sessionId);

    const parsed = tryParseJsonFromText(response);
    if (!parsed.ok) throw new Error(parsed.error || 'Failed to parse JSON');

    const validation = validateRequiredFields(parsed.data, schema.requiredFields);
    if (!validation.ok) throw new Error(validation.error || 'Validation failed');

    res.json({
      success: true,
      data: parsed.data,
      raw_response: response,
      sessionId,
    });
  } catch (err) {
    res.json({ success: false, error: err.message, raw_response: fullPrompt });
  }
});

app.post('/end-session', (req, res) => {
  const { callId } = req.body;
  if (callId && sessions.has(callId)) sessions.delete(callId);
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openrouter-api-server',
    model: CLAUDE_MODEL,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Claude HTTP API Server (OpenRouter)',
    version: '1.0.0',
    endpoints: {
      'POST /ask': 'Send a prompt to Claude',
      'POST /ask-structured': 'Send a prompt and return validated JSON',
      'POST /end-session': 'End session',
      'GET /health': 'Health check',
    },
  });
});

// ==== Start Server ====
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(64));
  console.log('Claude HTTP API Server (OpenRouter)');
  console.log('='.repeat(64));
  console.log(`Listening on: http://0.0.0.0:${PORT}`);
  console.log('Ready to receive Claude queries.');
});
