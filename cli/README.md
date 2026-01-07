# Claude Phone CLI

Unified command-line interface for Claude Phone. Transform multi-component manual setup into single-command simplicity.

## Installation

### One-Line Install (Mac)

```bash
curl -sSL https://raw.githubusercontent.com/networkchuck/claude-phone/main/install.sh | bash
```

### Manual Install

1. Clone the repository:
```bash
git clone https://github.com/networkchuck/claude-phone.git
cd claude-phone
```

2. Install CLI dependencies:
```bash
cd cli
npm install
```

3. Link the CLI:
```bash
npm link
```

## Usage

### Setup (First Time)

Run the interactive setup wizard to configure API keys, 3CX settings, and your first device:

```bash
claude-phone setup
```

The wizard will:
1. Validate your ElevenLabs API key
2. Validate your OpenAI API key
3. Configure your 3CX SIP settings
4. Set up your first device (extension, voice, prompt)
5. Configure server settings (ports, IP)

Configuration is saved to `~/.claude-phone/config.json` (chmod 600).

### Start Services

Launch all services (Docker containers + claude-api-server):

```bash
claude-phone start
```

This will:
1. Check Docker is installed and running
2. Generate Docker compose config from your settings
3. Write device configurations to voice-app
4. Start drachtio, freeswitch, and voice-app containers
5. Start claude-api-server as a background process

### Stop Services

Shut down all services cleanly:

```bash
claude-phone stop
```

This will:
1. Stop claude-api-server (SIGTERM, then SIGKILL if needed)
2. Stop all Docker containers

### Check Status

See what's running:

```bash
claude-phone status
```

Shows:
- Claude API server status (running/stopped, PID, port)
- Docker container status (drachtio, freeswitch, voice-app)
- Configured devices
- Network settings

### Update Configuration

Re-run setup to update your configuration:

```bash
claude-phone setup
```

Existing values will be shown as defaults.

## Configuration

Configuration is stored in `~/.claude-phone/config.json`:

```json
{
  "version": "1.0.0",
  "api": {
    "elevenlabs": { "apiKey": "...", "validated": true },
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
  "paths": {
    "voiceApp": "/path/to/voice-app",
    "claudeApiServer": "/path/to/claude-api-server"
  }
}
```

## Development

### Run Tests

```bash
npm test
```

Tests cover:
- Config read/write with proper permissions
- Process management (PID files, start/stop)
- API key validation
- Docker operations

### Lint Code

```bash
npm run lint
```

## Architecture

The CLI wraps existing components:

```
claude-phone (CLI)
├─> setup     → Interactive wizard, validates API keys
├─> start     → Generates configs, starts Docker + server
├─> stop      → Stops all services cleanly
└─> status    → Shows what's running

Manages:
├─> ~/.claude-phone/config.json       (user config)
├─> ~/.claude-phone/docker-compose.yml (generated)
├─> ~/.claude-phone/.env               (generated)
└─> ~/.claude-phone/server.pid         (process tracking)

Launches:
├─> Docker containers (drachtio, freeswitch, voice-app)
└─> claude-api-server (background process, detached)
```

## Requirements

- macOS (Linux support coming)
- Node.js 18+
- Docker Desktop
- Claude CLI (for claude-api-server)

## Future Enhancements (Phase 2+)

- [ ] `claude-phone devices add` - Add additional devices
- [ ] `claude-phone devices list` - List configured devices
- [ ] `claude-phone devices remove` - Remove device
- [ ] `claude-phone logs` - Tail logs from all services
- [ ] `claude-phone restart` - Restart services
- [ ] `claude-phone test call` - Make a test outbound call
- [ ] Linux support
- [ ] Auto-update mechanism
- [ ] Health checks for all services
- [ ] Webhook notifications

## License

MIT
