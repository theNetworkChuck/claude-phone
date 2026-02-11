/**
 * Gemini API Bridge
 * HTTP client for Gemini API with session management
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiClient = null;
const activeSessions = new Map();

/**
 * Get or initialize Gemini client
 */
function getGeminiClient() {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("[GEMINI] GEMINI_API_KEY not set - LLM queries will not work");
      return null;
    }
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
}

/**
 * Query Gemini with session support
 * @param {string} prompt - The prompt/question to send to Gemini
 * @param {Object} options - Options including callId for session management
 * @param {string} options.callId - Call UUID for maintaining conversation context
 * @param {string} options.devicePrompt - Device-specific personality prompt
 * @param {number} options.timeout - Timeout in seconds (default: 30)
 * @returns {Promise<string>} Gemini's response
 */
async function query(prompt, options = {}) {
  const { callId, devicePrompt, timeout = 30 } = options;
  const timestamp = new Date().toISOString();

  try {
    console.log(`[${timestamp}] GEMINI Sending query...`);
    if (callId) {
      console.log(`[${timestamp}] GEMINI Session: ${callId}`);
    }
    if (devicePrompt) {
      console.log(`[${timestamp}] GEMINI Device prompt: ${devicePrompt.substring(0, 50)}...`);
    }

    const client = getGeminiClient();
    if (!client) {
      throw new Error("Gemini API key not configured");
    }

    // Get or create chat session for this call
    let chatSession = activeSessions.get(callId);
    
    if (!chatSession) {
      const model = client.getGenerativeModel({ model: 'gemini-pro' });
      const messages = [];
      
      // Add device prompt as initial context if provided
      if (devicePrompt) {
        messages.push({
          role: 'user',
          parts: [{ text: devicePrompt }]
        });
        messages.push({
          role: 'model',
          parts: [{ text: 'I understand. I will follow these instructions.' }]
        });
      }
      
      chatSession = model.startChat({
        history: messages,
      });
      
      if (callId) {
        activeSessions.set(callId, chatSession);
      }
    }

    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`ETIMEDOUT`)), timeout * 1000)
    );

    // Race between the actual request and the timeout
    const result = await Promise.race([
      chatSession.sendMessage(prompt),
      timeoutPromise
    ]);

    const responseText = result.response.text();
    
    console.log(`[${timestamp}] GEMINI Response received (${responseText.length} chars)`);
    if (callId) {
      console.log(`[${timestamp}] GEMINI Session ID: ${callId}`);
    }
    
    return responseText;

  } catch (error) {
    const timestamp = new Date().toISOString();

    // Connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
      console.warn(`[${timestamp}] GEMINI Connection error (${error.code})`);
      return "I'm having trouble connecting to the Gemini API. Please check your internet connection and API key.";
    }

    // Timeout error
    if (error.message === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error(`[${timestamp}] GEMINI Timeout after ${timeout} seconds`);
      return "I'm sorry, that request took too long. This might mean the Gemini API is slow or there's a network issue. Try asking something simpler.";
    }

    console.error(`[${timestamp}] GEMINI Error:`, error.message);
    return "I encountered an unexpected error. Please check that your Gemini API key is valid and you have internet connectivity.";
  }
}

/**
 * End a Gemini session when a call ends
 * @param {string} callId - The call UUID to end the session for
 */
async function endSession(callId) {
  if (!callId) return;
  
  const timestamp = new Date().toISOString();
  
  try {
    activeSessions.delete(callId);
    console.log(`[${timestamp}] GEMINI Session ended: ${callId}`);
  } catch (error) {
    console.warn(`[${timestamp}] GEMINI Failed to end session: ${error.message}`);
  }
}

/**
 * Check if Gemini API is configured and available
 * @returns {boolean} True if API key is set
 */
function isAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

module.exports = {
  query,
  endSession,
  isAvailable
};
