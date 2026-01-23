# Claude Phone

Voice interface for Claude Code via SIP/3CX. Call your AI, and your AI can call you.

📺 **[Watch the Setup Tutorial](https://youtu.be/cT22fTzotYc)** - Complete walkthrough from start to finish

## What is this?

Claude Phone gives your Claude Code installation a phone number. You can:

- **Inbound**: Call an extension and talk to Claude - run commands, check status, ask questions
- **Outbound**: Your server can call YOU with alerts, then have a conversation about what to do

## Prerequisites

Before you begin, you'll need:

| Requirement | Where to Get It | Notes |
|-------------|-----------------|-------|
| **3CX Cloud Account** | [3cx.com](https://www.3cx.com/) | Free tier works! The video walks through setup |
| **ElevenLabs API Key** | [elevenlabs.io](https://elevenlabs.io/) | For text-to-speech voices |
| **OpenAI API Key** | [platform.openai.com](https://platform.openai.com/) | For Whisper speech-to-text |
| **Claude Code CLI** | [claude.ai/code](https://claude.ai/code) | Requires Claude Max subscription |

> **Note:** The [video tutorial](https://youtu.be/cT22fTzotYc) walks through getting each of these step-by-step.

## Platform Support

| Platform | Status |
|----------|--------|
| **macOS** | ✅ Fully supported |
| **Linux** | ✅ Fully supported (including Raspberry Pi) |
| **Windows** | ❌ Not supported (may work with WSL, untested) |

## Architecture

Claude Phone supports two deployment modes:

### Split Mode (Recommended)

Best for most users. Run voice services on a Raspberry Pi, Claude API on your main machine.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────┐         ┌─────────────────────┐           │
│  │ Raspberry Pi │   ←→   │ Mac/Linux with      │           │
│  │ (voice-app)  │  HTTP  │ Claude Code CLI     │           │
│  └─────────────┘         │ (claude-api-server) │           │
│                          └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**When to use:** You want to dedicate a Pi to voice services, or keep Claude running on your main workstation.

### All-in-One Mode

Single machine runs everything. Simpler setup, requires one beefy server.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────┐           │
│  │     Single Server (Mac/Linux)                │           │
│  │  ┌───────────┐    ┌───────────────────┐    │           │
│  │  │ voice-app │ ←→ │ claude-api-server │    │           │
│  │  │ (Docker)  │    │ (Claude Code CLI) │    │           │
│  │  └───────────┘    └───────────────────┘    │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**When to use:** You have a Linux server or Mac that's always on and has Claude Code installed.

## Quick Start

### One-Line Install

```bash
curl -sSL https://raw.githubusercontent.com/theNetworkChuck/claude-phone/main/install.sh | bash
```

### Setup & Run

```bash
claude-phone setup    # Interactive configuration wizard
claude-phone start    # Launch all services
```

The setup wizard auto-detects your environment (Pi vs desktop) and guides you through configuration.

### For Split Deployments (Pi + API Server)

1. **On your Pi:**
   ```bash
   claude-phone setup   # Select "Voice Server" when prompted
   claude-phone start
   ```

2. **On your Mac/Linux with Claude Code:**
   ```bash
   claude-phone setup   # Select "API Server" when prompted
   claude-phone api-server
   ```

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude-phone setup` | Interactive configuration wizard |
| `claude-phone start` | Launch all services |
| `claude-phone stop` | Stop all services |
| `claude-phone status` | Show service status |
| `claude-phone doctor` | Health check for all services |
| `claude-phone device add` | Add a new device/extension |
| `claude-phone device list` | List configured devices |
| `claude-phone device remove <name>` | Remove a device |
| `claude-phone logs [service]` | Tail service logs |
| `claude-phone config show` | Display configuration (secrets redacted) |
| `claude-phone config path` | Show config file location |
| `claude-phone config reset` | Reset configuration (creates backup) |
| `claude-phone backup` | Create configuration backup |
| `claude-phone restore` | Restore from backup (interactive) |
| `claude-phone update` | Self-update the CLI |
| `claude-phone uninstall` | Complete removal |
| `claude-phone api-server [--port N]` | Start API server (split deployments) |

## Device Personalities

Each extension can have its own identity (name, voice, personality prompt). This lets you create specialized AI assistants:

- **Morpheus** (ext 9000) - General assistant
- **Cephanie** (ext 9002) - Storage monitoring bot
- Add your own with `claude-phone device add`

## API Endpoints

### Voice App (port 3000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/outbound-call` | Initiate an outbound call |
| GET | `/api/call/:callId` | Get call status |
| GET | `/api/calls` | List active calls |
| POST | `/api/query` | Query a device programmatically |
| GET | `/api/devices` | List configured devices |

### Outbound Call Example

```bash
curl -X POST http://localhost:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Alert: Server storage is at 90%",
    "mode": "conversation",
    "device": "Morpheus"
  }'
```

## Troubleshooting

### Quick Diagnostics

```bash
claude-phone doctor   # Automated health checks
claude-phone status   # Service status overview
```

### Common Issues

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Calls connect but no audio | Wrong `EXTERNAL_IP` | Run `claude-phone setup` and verify IP |
| Extension not registering | 3CX SBC not running | Check 3CX admin panel |
| API key validation failed | Billing not enabled | Add payment method to OpenAI/ElevenLabs |
| "Sorry, something went wrong" | API server unreachable | Check `claude-phone status` |

For detailed troubleshooting, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

The [video tutorial](https://youtu.be/cT22fTzotYc) also covers common setup issues.

## Development

### Running Tests

```bash
npm test              # All tests
npm run test:cli      # CLI tests only
npm run test:voice-app # Voice app tests only
```

### Linting

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

## Documentation

- [CLI Documentation](cli/README.md) - Detailed CLI usage
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Outbound Calling](voice-app/README-OUTBOUND.md) - API reference for outbound calls
- [Deployment Guide](voice-app/DEPLOYMENT.md) - Production deployment

## License

MIT
