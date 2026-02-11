/**
 * Voice Interface Application
 * Main entry point - v9 with Multi-Extension + Query API Support
 */

require("dotenv").config();
var Srf = require("drachtio-srf");
var Mrf = require("drachtio-fsmrf");

// Import application modules
var httpServerModule = require("./lib/http-server");
var createHttpServer = httpServerModule.createHttpServer;
var cleanupOldFiles = httpServerModule.cleanupOldFiles;
var AudioForkServer = require("./lib/audio-fork").AudioForkServer;
var sipHandler = require("./lib/sip-handler");
var handleInvite = sipHandler.handleInvite;
var extractCallerId = sipHandler.extractCallerId;
var speechClient = require("./lib/google-speech-client");
var geminiBridge = require("./lib/gemini-bridge");
var ttsService = require("./lib/tts-service");

// Multi-extension support
var deviceRegistry = require("./lib/device-registry");
var MultiRegistrar = require("./lib/multi-registrar");

// Connection retry utility
var connectionRetry = require("./lib/connection-retry");
var connectWithRetry = connectionRetry.connectWithRetry;

// Import outbound calling routes
var outboundModule = require("./lib/outbound-routes");
var outboundRouter = outboundModule.router;
var setupOutboundRoutes = outboundModule.setupRoutes;

// Import query routes
var queryModule = require("./lib/query-routes");
var queryRouter = queryModule.router;
var setupQueryRoutes = queryModule.setupRoutes;

// Load device registry first
// deviceRegistry is a singleton, already instantiated

// Configuration
var config = {
  drachtio: {
    host: process.env.DRACHTIO_HOST || "drachtio",
    port: parseInt(process.env.DRACHTIO_PORT) || 9022,
    secret: process.env.DRACHTIO_SECRET || "cymru"
  },
  freeswitch: {
    host: process.env.FREESWITCH_HOST || "freeswitch",
    port: parseInt(process.env.FREESWITCH_PORT) || 8021,
    secret: process.env.FREESWITCH_SECRET || "JambonzR0ck$"
  },
  sip: {
    extension: process.env.SIP_EXTENSION || "9000",
    auth_id: process.env.SIP_AUTH_ID || "Au0XZPTpJY",
    password: process.env.SIP_AUTH_PASSWORD || "DGHwMW6v25",
    domain: process.env.SIP_DOMAIN || "hello.networkchuck.com",
    registrar: process.env.SIP_REGISTRAR || "hello.networkchuck.com",
    registrar_port: parseInt(process.env.SIP_REGISTRAR_PORT) || 5060,
    expiry: parseInt(process.env.SIP_EXPIRY) || 3600
  },
  external_ip: process.env.EXTERNAL_IP || "10.70.7.81",
  http_port: parseInt(process.env.HTTP_PORT) || 3000,
  ws_port: parseInt(process.env.WS_PORT) || 3001,
  audio_dir: process.env.AUDIO_DIR || "/tmp/voice-audio"
};

// Initialize drachtio SRF
var srf = new Srf();
var mediaServer = null;
var httpServer = null;
var audioForkServer = null;
var registrar = null;
var drachtioConnected = false;
var freeswitchConnected = false;
var isReady = false;

// Log startup
console.log("\n" + "=".repeat(64));
console.log("          Voice Interface Application Starting                 ");
console.log("       (with Multi-Extension + Query API Support)              ");
console.log("=".repeat(64));
console.log("\nConfiguration:");
console.log("  - drachtio:    " + config.drachtio.host + ":" + config.drachtio.port);
console.log("  - FreeSWITCH:  " + config.freeswitch.host + ":" + config.freeswitch.port);
console.log("  - SIP Domain:  " + config.sip.domain);
console.log("  - Registrar:   " + config.sip.registrar + ":" + config.sip.registrar_port);
console.log("  - External IP: " + config.external_ip);
console.log("  - HTTP Port:   " + config.http_port);
console.log("  - WS Port:     " + config.ws_port);
console.log("  - Audio Dir:   " + config.audio_dir);
console.log("  - Mix Type:    " + (process.env.AUDIO_FORK_MIXTYPE || "L") + " (capture direction)");
console.log("\n[DEVICES] Loaded " + Object.keys(deviceRegistry.getAllDevices()).length + " device extensions");
console.log("\nWaiting for connections...\n");

// Connect to drachtio
srf.connect({
  host: config.drachtio.host,
  port: config.drachtio.port,
  secret: config.drachtio.secret
});

srf.on("connect", function(err, hostport) {
  console.log("[" + new Date().toISOString() + "] DRACHTIO Connected at " + hostport);
  drachtioConnected = true;

  var localAddress = config.external_ip;
  if (hostport && hostport.length > 0) {
    var match = hostport[0].match(/\/([^:]+)/);
    if (match) localAddress = match[1];
  }
  console.log("[DRACHTIO] Local SIP address: " + localAddress);

  // Start Multi-Registration for all devices
  if (!registrar) {
    registrar = new MultiRegistrar(srf, {
      domain: config.sip.domain,
      registrar: config.sip.registrar,
      registrar_port: config.sip.registrar_port,
      local_address: localAddress,
      local_port: parseInt(process.env.DRACHTIO_SIP_PORT) || 5060,
      expiry: config.sip.expiry
    });

    // Register all devices from config
    registrar.registerAll(deviceRegistry.getRegistrationConfigs());
  }

  checkReadyState();
});

srf.on("error", function(err) {
  console.error("[" + new Date().toISOString() + "] DRACHTIO error: " + err.message);
  drachtioConnected = false;
});

// Initialize FreeSWITCH MRF with retry logic
var mrf = new Mrf(srf);

// Define FreeSWITCH connection function
function connectToFreeswitch() {
  return mrf.connect({
    address: config.freeswitch.host,
    port: config.freeswitch.port,
    secret: config.freeswitch.secret
  });
}

// Connect with exponential backoff retry
// Retry schedule: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 10s (max 10 retries)
connectWithRetry(connectToFreeswitch, {
  maxRetries: 10,
  retryDelays: [1000, 2000, 3000, 5000, 5000, 5000, 10000, 10000, 10000, 10000],
  name: 'FREESWITCH'
})
.then(function(ms) {
  mediaServer = ms;
  freeswitchConnected = true;
  console.log("[" + new Date().toISOString() + "] FREESWITCH Ready for calls");
  checkReadyState();
})
.catch(function(err) {
  console.error("[" + new Date().toISOString() + "] FREESWITCH Connection failed permanently: " + err.message);
  console.error("[" + new Date().toISOString() + "] Please check:");
  console.error("  1. FreeSWITCH container is running: docker ps | grep freeswitch");
  console.error("  2. ESL port 8021 is accessible");
  console.error("  3. EXTERNAL_IP is set correctly in .env");
  process.exit(1);
});

// Initialize servers
function initializeServers() {
  var fs = require("fs");
  if (!fs.existsSync(config.audio_dir)) {
    fs.mkdirSync(config.audio_dir, { recursive: true });
  }

  // HTTP server for TTS audio
  httpServer = createHttpServer(config.audio_dir, config.http_port);
  console.log("[" + new Date().toISOString() + "] HTTP Server started on port " + config.http_port);

  // WebSocket server for audio fork
  audioForkServer = new AudioForkServer({ port: config.ws_port });
  audioForkServer.start();
  audioForkServer.on("listening", function() {
    console.log("[" + new Date().toISOString() + "] WEBSOCKET Audio fork server started on port " + config.ws_port);
  });
  audioForkServer.on("session", function(session) {
    console.log("[AUDIO] New session for call " + session.callUuid);
  });

  // TTS service
  ttsService.setAudioDir(config.audio_dir);
  console.log("[" + new Date().toISOString() + "] TTS Service configured");

  // ========== OUTBOUND CALLING ROUTES ==========
  setupOutboundRoutes({
    srf: srf,
    mediaServer: mediaServer,
    deviceRegistry: deviceRegistry,  // Required for device lookup
    audioForkServer: audioForkServer,
    speechClient: speechClient,
    geminiBridge: geminiBridge,
    ttsService: ttsService,
    wsPort: config.ws_port
  });

  httpServer.app.use("/api", outboundRouter);
  console.log("[" + new Date().toISOString() + "] OUTBOUND Calling API enabled");

  // ========== QUERY API ROUTES ==========
  setupQueryRoutes({
    geminiBridge: geminiBridge
  });

  httpServer.app.use("/api", queryRouter);
  console.log("[" + new Date().toISOString() + "] QUERY API enabled (/api/query, /api/devices)");

  // Finalize HTTP server
  httpServer.finalize();

  // Cleanup old files periodically
  setInterval(function() {
    cleanupOldFiles(config.audio_dir, 5 * 60 * 1000);
  }, 60 * 1000);
}

// Check ready state
function checkReadyState() {
  if (drachtioConnected && freeswitchConnected && !isReady) {
    isReady = true;
    console.log("\n[" + new Date().toISOString() + "] READY Voice interface is fully connected!");
    console.log("=".repeat(64) + "\n");

    initializeServers();

    // Register SIP INVITE handler
    srf.invite(function(req, res) {
      handleInvite(req, res, {
        audioForkServer: audioForkServer,
        mediaServer: mediaServer,
        deviceRegistry: deviceRegistry,
        config: config,
        speechClient: speechClient,
        geminiBridge: geminiBridge,
        ttsService: ttsService,
        wsPort: config.ws_port,
        externalIp: config.external_ip
      }).catch(function(err) {
        console.error("[" + new Date().toISOString() + "] CALL Error: " + err.message);
      });
    });

    console.log("[" + new Date().toISOString() + "] SIP INVITE handler registered");
    console.log("[" + new Date().toISOString() + "] Multi-extension voice interface ready!");
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log("\n[" + new Date().toISOString() + "] Received " + signal + ", shutting down...");
  if (registrar) registrar.stop();
  if (httpServer) httpServer.close();
  if (audioForkServer) audioForkServer.stop();
  if (mediaServer) mediaServer.disconnect();
  srf.disconnect();
  setTimeout(function() { process.exit(0); }, 1000);
}

process.on("SIGTERM", function() { shutdown("SIGTERM"); });
process.on("SIGINT", function() { shutdown("SIGINT"); });
