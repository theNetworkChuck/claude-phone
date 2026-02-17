# Claude Phone CLI

Command-line interface for Claude Phone. Single-command setup and management.

## Installation

### One-Line Install

```bash
curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash
```

### Manual Install

```bash
git clone https://github.com/theNetworkChuck/claude-phone.git
cd claude-phone/cli
npm install
npm link
```

## Setup Wizard

```bash
claude-phone setup
```

The wizard guides you through configuration based on your deployment type:

### Voice Server

Select this when setting up a Raspberry Pi or dedicated voice box that connects to a remote API server.

**What it asks for:**
1. 3CX SIP domain and registrar
2. API server IP and port (where the API server runs)
3. ElevenLabs API key and default voice ID
4. OpenAI API key (for Whisper STT)
5. Device configuration (name, extension, auth, voice, prompt)
6. Server LAN IP (for RTP audio routing)

**What `claude-phone start` does:**
- Starts Docker containers (drachtio, freeswitch, voice-app)
- Connects to the remote API server you specified

### API Server

Select this when setting up the API server wrapper on a machine with your assistant backend (Claude Code, Codex, or OpenAI Responses API).

**What it asks for:**
- API server port (default: 3333)

**What `claude-phone start` does:**
- Starts the API server on the configured port using the configured backend (default: Claude)

**Note:** You can also just run `claude-phone api-server` without setup - it defaults to port 3333.

### Both (All-in-One)

Select this for a single machine running everything.

**What it asks for:**
1. ElevenLabs API key and default voice ID
2. OpenAI API key
3. 3CX SIP domain and registrar
4. Device configuration
5. Server LAN IP, API port, and HTTP port

**What `claude-phone start` does:**
- Starts Docker containers (drachtio, freeswitch, voice-app)
- Starts the API server

### Pi Auto-Detection

On Raspberry Pi, the setup wizard:
- Recommends "Voice Server" mode if you select "Both"
- Checks for 3CX SBC on port 5060 and auto-configures drachtio to use 5070 to avoid conflicts
- Uses optimized settings for Pi hardware

## Commands

### Setup & Configuration

```bash
claude-phone setup              # Interactive configuration wizard
claude-phone setup --skip-prereqs   # Skip prerequisite checks
claude-phone config show        # Display config (secrets redacted)
claude-phone config path        # Show config file location (~/.claude-phone/config.json)
claude-phone config reset       # Reset config (creates backup first)
```

### Service Management

```bash
claude-phone start              # Start services based on installation type
claude-phone stop               # Stop all services
claude-phone status             # Show service status
claude-phone doctor             # Health check for dependencies and services
claude-phone api-server         # Start API server standalone (default port 3333)
claude-phone api-server -p 4000 # Start on custom port
claude-phone api-server --backend codex # Wrap Codex CLI instead of Claude
claude-phone api-server --backend openai # Use OpenAI Responses API directly
```

### Device Management

```bash
claude-phone device add         # Add a new device/extension
claude-phone device list        # List configured devices
claude-phone device remove <name>   # Remove a device by name
```

### Logs

```bash
claude-phone logs               # Tail all service logs
claude-phone logs voice-app     # Voice app only
claude-phone logs drachtio      # SIP server only
claude-phone logs freeswitch    # Media server only
```

### Backup & Recovery

```bash
claude-phone backup             # Create timestamped backup
claude-phone restore            # Restore from backup (interactive)
```

### Maintenance

```bash
claude-phone update             # Update Claude Phone to latest
claude-phone uninstall          # Complete removal
```

## Configuration Files

All configuration is stored in `~/.claude-phone/`:

For isolated testing (without touching your real `~/.claude-phone`), set:

```bash
export CLAUDE_PHONE_CONFIG_DIR=/tmp/claude-phone-config
```

```
~/.claude-phone/
├── config.json           # Main configuration (chmod 600)
├── docker-compose.yml    # Generated Docker config
├── .env                  # Generated environment file
├── server.pid            # API server process ID
└── backups/              # Configuration backups
```

### Config Structure

```json
{
  "version": "1.0.0",
  "installationType": "both",
  "api": {
    "elevenlabs": { "apiKey": "...", "defaultVoiceId": "...", "validated": true },
    "openai": { "apiKey": "...", "validated": true }
  },
  "sip": {
    "domain": "your-3cx.3cx.us",
    "registrar": "192.168.1.100",
    "transport": "udp"
  },
  "server": {
    "claudeApiPort": 3333,
    "httpPort": 3000,
    "externalIp": "192.168.1.50"
  },
  "devices": [{
    "name": "Morpheus",
    "extension": "9000",
    "authId": "9000",
    "password": "***",
    "voiceId": "elevenlabs-voice-id",
    "prompt": "You are Morpheus..."
  }],
  "deployment": {
    "mode": "both"
  }
}
```

## Split Deployment Example

### On Raspberry Pi (Voice Server)

```bash
# Install
curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash

# Setup - select "Voice Server"
# Enter your Mac's IP when prompted for API server
claude-phone setup

# Start voice services
claude-phone start
```

### On Mac (API Server)

```bash
# Install (if not already)
curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash

# Start API server (no setup needed)
claude-phone api-server

# Or on a custom port
claude-phone api-server --port 4000

# Or wrap Codex CLI instead of Claude
claude-phone api-server --backend codex

# Or use OpenAI Responses API directly
claude-phone api-server --backend openai
```

## Requirements

- **Node.js 18+** - Required for CLI
- **Docker** - Required for Voice Server or Both modes
- **Assistant Backend (choose one)** - Required for API Server or Both modes
  - Claude Code CLI
  - OpenAI Codex CLI (`npm i -g @openai/codex` or `brew install --cask codex`)
  - OpenAI Responses API (`OPENAI_API_KEY`, no local CLI required)

## Development

```bash
# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
