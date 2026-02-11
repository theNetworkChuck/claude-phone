/**
 * Google Cloud Speech-to-Text API Client
 * Converts audio buffers (L16 PCM from FreeSWITCH) to text
 */

const speech = require('@google-cloud/speech');
const WaveFile = require("wavefile").WaveFile;
const fs = require("fs");
const path = require("path");

// Lazy-initialized Google Cloud Speech client
let speechClient = null;

function getSpeechClient() {
  if (!speechClient) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
      console.warn("[SPEECH] GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT not set - STT will not work");
      return null;
    }
    speechClient = new speech.SpeechClient();
  }
  return speechClient;
}

/**
 * Convert L16 PCM buffer to WAV format for Speech API
 * @param {Buffer} pcmBuffer - Raw L16 PCM audio data
 * @param {number} sampleRate - Sample rate (default: 8000 Hz for telephony)
 * @returns {Buffer} WAV file buffer
 */
function pcmToWav(pcmBuffer, sampleRate = 8000) {
  const wav = new WaveFile();

  // Convert Buffer to Int16Array for wavefile library
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

  // Create WAV from raw PCM data
  wav.fromScratch(1, sampleRate, "16", samples);

  return Buffer.from(wav.toBuffer());
}

/**
 * Transcribe audio using Google Cloud Speech-to-Text API
 * @param {Buffer} audioBuffer - Audio data (either WAV or raw PCM)
 * @param {Object} options - Transcription options
 * @param {string} options.format - Input format: "wav" or "pcm" (default: "pcm")
 * @param {number} options.sampleRate - Sample rate for PCM (default: 8000)
 * @param {string} options.language - Language code (default: "en-US")
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer, options = {}) {
  const {
    format = "pcm",
    sampleRate = 8000,
    language = "en-US"
  } = options;

  const client = getSpeechClient();
  if (!client) {
    throw new Error("Google Cloud Speech credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT");
  }

  // Convert PCM to base64 for API transmission
  let audioData;
  if (format === "pcm") {
    const wavBuffer = pcmToWav(audioBuffer, sampleRate);
    audioData = wavBuffer.toString('base64');
  } else {
    audioData = audioBuffer.toString('base64');
  }

  try {
    const request = {
      audio: {
        content: audioData,
      },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: sampleRate,
        languageCode: language,
        model: 'latest_long',
      },
    };

    const [response] = await client.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    const timestamp = new Date().toISOString();
    console.log("[" + timestamp + "] SPEECH Transcribed: " + transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));

    return transcription;
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] SPEECH Error:`, error.message);
    throw error;
  }
}

/**
 * Check if Google Cloud Speech API is configured and available
 * @returns {boolean} True if credentials are set
 */
function isAvailable() {
  return !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT);
}

module.exports = {
  transcribe,
  pcmToWav,
  isAvailable
};
