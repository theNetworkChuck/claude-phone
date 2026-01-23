# Claude Phone CLI

Unified command-line interface for Claude Phone. Single-command setup and management.

## Installation

### One-Line Install (macOS/Linux)

```bash
curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash
```

### Manual Install

```bash
git clone https://github.com/networkchuck/claude-phone.git
cd claude-phone/cli
npm install
npm link
```

## Installation Types

The setup wizard supports three installation types:

| Type | Use Case | What Runs |
|------|----------|-----------|
| **Voice Server** | Raspberry Pi or dedicated voice box | Docker containers (drachtio, freeswitch, voice-app) |
| **API Server** | Mac/Linux with Claude Code CLI | claude-api-server only |
| **Both** | All-in-one on single machine | Everything |

## Commands

### Setup & Configuration

```bash
claude-phone setup [--skip-prereqs]   # Interactive configuration wizard
claude-phone config show              # Display configuration (secrets redacted)
claude-phone config path              # Show config file location
claude-phone config reset             # Reset configuration (creates backup)
```

### Service Management

```bash
claude-phone start                    # Launch all services
claude-phone stop                     # Stop all services
claude-phone status                   # Show service status
claude-phone doctor                   # Health check for all services
claude-phone logs [service]           # Tail logs (voice-app, drachtio, freeswitch)
```

### Device Management

```bash
claude-phone device add               # Add a new device/extension
claude-phone device list              # List configured devices
claude-phone device remove <name>     # Remove a device
```

### Backup & Recovery

```bash
claude-phone backup                   # Create timestamped configuration backup
claude-phone restore                  # Restore configuration from backup (interactive)
```

### Maintenance

```bash
claude-phone update                   # Self-update the CLI
claude-phone uninstall                # Complete removal of Claude Phone
```

### Split Deployment

```bash
claude-phone api-server [--port N]    # Start Claude API server (for split deployments)
```

## Usage Examples

### First Time Setup

```bash
claude-phone setup
```

The wizard will:
1. Check prerequisites (Node.js, Docker, etc.)
2. Ask for installation type (Voice Server, API Server, or Both)
3. Validate your API keys (ElevenLabs, OpenAI)
4. Configure 3CX SIP settings
5. Set up your first device (extension, voice, prompt)
6. Configure network settings (IP, ports)

### Adding Multiple Devices

```bash
claude-phone device add
```

Each device gets its own:
- SIP extension (from 3CX)
- ElevenLabs voice
- System prompt/personality

### Checking Service Health

```bash
claude-phone doctor
```

Runs comprehensive health checks:
- Docker daemon running
- All containers healthy
- API server responding
- Network connectivity
- SIP registration status

### Viewing Logs

```bash
claude-phone logs                     # All services
claude-phone logs voice-app           # Voice app only
claude-phone logs drachtio            # SIP server only
claude-phone logs freeswitch          # Media server only
```

## Configuration

Configuration is stored in `~/.claude-phone/config.json` (chmod 600):

```json
{
  "version": "1.0.0",
  "installationType": "both",
  "api": {
    "elevenlabs": { "apiKey": "...", "validated": true },
    "openai": { "apiKey": "...", "validated": true }
  },
  "sip": {
    "domain": "your-3cx.3cx.us",
    "registrar": "your-3cx.3cx.us",
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
  }]
}
```

## Architecture

```
claude-phone (CLI)
├── setup        → Interactive wizard, validates API keys, prereq checks
├── start        → Generates configs, starts Docker + API server
├── stop         → Stops all services cleanly
├── status       → Shows what's running
├── doctor       → Comprehensive health checks
├── device       → Add/list/remove SIP devices
│   ├── add
│   ├── list
│   └── remove
├── logs         → Tail service logs
├── config       → Configuration management
│   ├── show
│   ├── path
│   └── reset
├── backup       → Create configuration backup
├── restore      → Restore from backup
├── update       → Self-update CLI
├── uninstall    → Complete removal
└── api-server   → Start API server (split mode)

Manages:
├── ~/.claude-phone/config.json        (user config)
├── ~/.claude-phone/docker-compose.yml (generated)
├── ~/.claude-phone/.env               (generated)
├── ~/.claude-phone/server.pid         (process tracking)
└── ~/.claude-phone/backups/           (configuration backups)
```

## Requirements

- macOS or Linux (including Raspberry Pi)
- Node.js 18+
- Docker (for Voice Server or Both modes)
- Claude Code CLI (for API Server or Both modes)

## Development

### Run Tests

```bash
npm test
```

### Lint Code

```bash
npm run lint
```

## License

MIT
