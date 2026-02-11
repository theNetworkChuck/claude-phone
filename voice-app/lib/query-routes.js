/**
 * Query API Routes
 * Express routes for programmatic Gemini queries from n8n or other systems
 * Supports both text and structured JSON responses with device-specific context
 *
 * v2: Uses /ask-structured for JSON format, proper callId for skills access
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const logger = require('./logger');
const deviceRegistry = require('./device-registry');

// Dependencies injected via setupRoutes()
let geminiBridge = null;

// Gemini API server URL (same as used by geminiBridge)
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://localhost:3333';

/**
 * Extract voice-friendly line from Gemini response
 * Copied from conversation-loop.js for consistency
 */
function extractVoiceLine(response) {
  /**
   * Clean markdown and formatting from text for speech
   */
  function cleanForSpeech(text) {
    return text
      .replace(/\*+/g, '')              // Remove bold/italic markers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert [text](url) to just text
      .replace(/\[([^\]]+)\]/g, '$1')   // Remove remaining brackets
      .trim();
  }

  // Priority 1: Check for new VOICE_RESPONSE line (voice-optimized content)
  const voiceMatch = response.match(/🗣️\s*VOICE_RESPONSE:\s*([^\n]+)/im);
  if (voiceMatch) {
    const text = cleanForSpeech(voiceMatch[1]);
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    // Accept if under 60 words
    if (text && wordCount <= 60) {
      return text;
    }

    // If too long, log warning but continue to next fallback
    logger.warn('VOICE_RESPONSE too long, falling back', { wordCount, maxWords: 60 });
  }

  // Priority 2: Check for legacy CUSTOM COMPLETED line
  const customMatch = response.match(/🗣️\s*CUSTOM\s+COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (customMatch) {
    const text = cleanForSpeech(customMatch[1]);
    if (text && text.split(/\s+/).length <= 50) {
      return text;
    }
  }

  // Priority 3: Check for standard COMPLETED line
  const completedMatch = response.match(/🎯\s*COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (completedMatch) {
    return cleanForSpeech(completedMatch[1]);
  }

  // Priority 4: Fallback to first sentence
  const firstSentence = response.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length < 500) {
    return firstSentence.trim();
  }

  // Last resort: truncate
  return response.substring(0, 500).trim();
}

/**
 * Extract JSON from Claude response
 * Handles markdown code fences and inline JSON
 */
function extractJson(text) {
  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Try extracting from markdown fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  // Try finding balanced braces
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  }

  return null;
}

/**
 * Build query context for JSON format
 * Forces Claude to return structured JSON with specified schema
 */
function buildJsonQueryContext(schema) {
  if (!schema || !schema.requiredFields) {
    return '[STRUCTURED QUERY - RESPOND WITH JSON ONLY]\nReturn a valid JSON object. No markdown, no code fences, no explanations.';
  }

  let context = '[STRUCTURED QUERY - RESPOND WITH JSON ONLY]\n';
  context += 'Return EXACTLY ONE valid JSON object. No markdown, no code fences, no explanations.\n';
  context += `Required fields: ${JSON.stringify(schema.requiredFields)}\n`;

  if (schema.fieldGuidance) {
    context += `Field guidance: ${JSON.stringify(schema.fieldGuidance)}\n`;
  }

  return context;
}

/**
 * Validate query request
 */
function validateQueryRequest(body) {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  // Required: 'query' field
  if (!body.query) {
    return { valid: false, error: 'Field "query" is required' };
  }

  if (typeof body.query !== 'string' || body.query.trim().length === 0) {
    return { valid: false, error: 'Field "query" must be a non-empty string' };
  }

  if (body.query.length > 2000) {
    return { valid: false, error: 'Field "query" must be 2000 characters or less' };
  }

  // Optional: 'format' validation
  if (body.format && !['text', 'json'].includes(body.format)) {
    return { valid: false, error: 'Field "format" must be either "text" or "json"' };
  }

  // If format is json, schema is required
  if (body.format === 'json' && !body.schema) {
    return { valid: false, error: 'Field "schema" is required when format is "json"' };
  }

  // Validate schema structure if provided
  if (body.schema) {
    if (!body.schema.requiredFields || !Array.isArray(body.schema.requiredFields)) {
      return { valid: false, error: 'schema.requiredFields must be an array' };
    }

    if (body.schema.requiredFields.length === 0) {
      return { valid: false, error: 'schema.requiredFields must contain at least one field' };
    }
  }

  // Optional: 'timeout' validation
  if (body.timeout !== undefined) {
    const timeout = Number(body.timeout);
    if (!Number.isInteger(timeout) || timeout < 10 || timeout > 300) {
      return { valid: false, error: 'Field "timeout" must be an integer between 10 and 300 seconds' };
    }
  }

  return { valid: true };
}

/**
 * POST /query
 * Execute a Claude query with optional device context and structured output
 *
 * v2: Each query gets a unique callId for skills access
 *     JSON format uses /ask-structured endpoint for reliable parsing
 */
router.post('/query', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate request
    const validation = validateQueryRequest(req.body);
    if (!validation.valid) {
      logger.warn('Invalid query request', {
        error: validation.error,
        body: req.body
      });

      return res.status(400).json({
        success: false,
        error: 'validation_failed',
        message: validation.error
      });
    }

    // Extract parameters
    const {
      query,
      device: deviceIdentifier,
      context: injectedContext,
      format = 'text',
      schema,
      timeout = 120
    } = req.body;

    // Generate unique callId for this query (enables skills access)
    // Must be a bare UUID - Claude CLI rejects prefixes
    const callId = crypto.randomUUID();

    // Resolve device if specified
    let device = null;
    let devicePrompt = null;

    if (deviceIdentifier) {
      device = deviceRegistry.get(deviceIdentifier);

      if (!device) {
        logger.warn('Device not found, using default', { deviceIdentifier });
        device = deviceRegistry.getDefault();
      }

      devicePrompt = device.prompt;
    }

    // Build the full prompt with injected context
    let fullPrompt = query;

    // Add injected context if provided
    if (injectedContext && typeof injectedContext === 'object') {
      const contextStr = Object.entries(injectedContext)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      fullPrompt = `Context:\n${contextStr}\n\n${fullPrompt}`;
    }

    logger.info('Processing query request', {
      queryLength: query.length,
      device: device ? device.name : 'default',
      format,
      hasSchema: !!schema,
      hasContext: !!injectedContext,
      timeout,
      callId
    });

    let response;
    let structured = null;

    if (format === 'json') {
      // Use /ask-structured endpoint for reliable JSON parsing
      logger.info('Using /ask-structured endpoint for JSON format');

      const structuredResponse = await axios.post(
        `${CLAUDE_API_URL}/ask-structured`,
        {
          prompt: fullPrompt,
          callId,
          devicePrompt,
          schema: {
            queryType: schema?.queryType || 'general',
            requiredFields: schema?.requiredFields || [],
            fieldGuidance: schema?.fieldGuidance || {},
            allowExtraFields: true,
            example: schema?.example
          },
          includeVoiceContext: false,
          maxRetries: 1
        },
        {
          timeout: timeout * 1000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (structuredResponse.data.success) {
        response = structuredResponse.data.raw_response;
        structured = structuredResponse.data.data;
      } else {
        // Fallback: return raw response even if parsing failed
        response = structuredResponse.data.raw_response || '';
        logger.warn('Structured query returned failure', {
          error: structuredResponse.data.error
        });
      }
    } else {
      // Use /ask endpoint for text format (via geminiBridge)
      // Check if Gemini bridge is available
      if (!geminiBridge) {
        logger.error('Gemini bridge not available');

        return res.status(503).json({
          success: false,
          error: 'service_unavailable',
          message: 'Gemini API is not ready'
        });
      }

      response = await geminiBridge.query(fullPrompt, {
        callId,
        devicePrompt,
        timeout
      });
    }

    const duration = Date.now() - startTime;

    // Extract voice line
    const voiceLine = extractVoiceLine(response);

    // Build response object
    const responseObj = {
      success: true,
      response,
      voiceLine,
      duration_ms: duration
    };

    // Add device info if specified
    if (device) {
      responseObj.device = {
        name: device.name,
        extension: device.extension
      };
    }

    // Add structured data if JSON format
    if (format === 'json') {
      if (structured) {
        responseObj.structured = structured;

        logger.info('Query completed with structured output', {
          duration,
          device: device ? device.name : 'default',
          structuredFields: Object.keys(structured)
        });
      } else {
        // Try client-side extraction as fallback
        const fallbackStructured = extractJson(response);
        responseObj.structured = fallbackStructured;

        if (!fallbackStructured) {
          responseObj.warning = 'Failed to parse JSON from Claude response';
        }

        logger.warn('Used client-side JSON extraction', {
          duration,
          device: device ? device.name : 'default',
          success: !!fallbackStructured
        });
      }
    } else {
      logger.info('Query completed', {
        duration,
        device: device ? device.name : 'default',
        responseLength: response.length
      });
    }

    res.json(responseObj);

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Query endpoint error', {
      error: error.message,
      stack: error.stack,
      duration
    });

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'An internal error occurred',
      duration_ms: duration
    });
  }
});

/**
 * GET /devices
 * List all registered devices
 */
router.get('/devices', (req, res) => {
  try {
    const allDevices = deviceRegistry.getAll();

    const deviceList = Object.values(allDevices).map(device => ({
      name: device.name,
      extension: device.extension,
      hasVoice: !!device.voiceId,
      hasPrompt: !!device.prompt
    }));

    res.json({
      success: true,
      count: deviceList.length,
      devices: deviceList
    });

  } catch (error) {
    logger.error('Get devices error', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Failed to retrieve devices'
    });
  }
});

/**
 * GET /device/:identifier
 * Get specific device by name or extension
 */
router.get('/device/:identifier', (req, res) => {
  try {
    const { identifier } = req.params;

    const device = deviceRegistry.get(identifier);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      device: {
        name: device.name,
        extension: device.extension,
        hasVoice: !!device.voiceId,
        hasPrompt: !!device.prompt,
        voiceId: device.voiceId
      }
    });

  } catch (error) {
    logger.error('Get device error', {
      error: error.message,
      identifier: req.params.identifier
    });

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Failed to retrieve device'
    });
  }
});

/**
 * Setup routes with dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.geminiBridge - Gemini API bridge
 */
function setupRoutes(deps) {
  geminiBridge = deps.geminiBridge;

  logger.info('Query routes initialized', {
    geminiBridge: !!geminiBridge
  });
}

module.exports = {
  router,
  setupRoutes
};
