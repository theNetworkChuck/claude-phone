# Unified Installer Implementation Plan

> HOW to build what the spec defined. Technical decisions and architecture.

**Spec:** [SPEC.md](./SPEC.md)
**Status:** DRAFT

---

## Technical Approach

### Architecture Decision

Build a **Node.js CLI tool** distributed via a bash install script. The CLI wraps existing functionality (voice-app Docker container, claude-api-server) with a unified command interface.

```
┌─────────────────────────────────────────────────────────────────┐
│  User runs: curl ... | bash                                     │
│      │                                                          │
│      ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  install.sh                                              │   │
│  │  - Detect OS (mac/linux)                                 │   │
│  │  - Download claude-phone CLI                             │   │
│  │  - Add to PATH (~/.local/bin or /usr/local/bin)          │   │
│  │  - Verify prerequisites (Docker, Claude CLI)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  User runs: claude-phone setup                                  │
│      │                                                          │
│      ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Setup Wizard (inquirer prompts)                         │   │
│  │  - Collect API keys                                      │   │
│  │  - Validate each key with test API call                  │   │
│  │  - Collect 3CX credentials                               │   │
│  │  - Create first device                                   │   │
│  │  - Write ~/.claude-phone/config.json                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  User runs: claude-phone start                                  │
│      │                                                          │
│      ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Start Services                                          │   │
│  │  1. Generate .env from config.json                       │   │
│  │  2. docker compose up -d (voice-app)                     │   │
│  │  3. Fork claude-api-server, write PID                    │   │
│  │  4. Health check all services                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Technical Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI Framework | Commander.js | Mature, simple, widely used, minimal deps |
| Interactive Prompts | Inquirer.js | Best UX for terminal wizards, validation built-in |
| Config Format | JSON | Simple, no additional deps, easy to hand-edit |
| Process Fork | Node child_process.spawn | Native, no PM2 dependency, detached mode |
| Package Format | Tarball on GitHub Releases | Simple distribution, no npm publish needed |
| Install Location | ~/.local/bin (Linux) or /usr/local/bin (Mac) | Standard user-writable locations |

---

## Project Structure

```
claude-phone/
├── install.sh                    # Curl-able install script
├── cli/                          # NEW: CLI tool source
│   ├── package.json
│   ├── bin/
│   │   └── claude-phone.js       # Entry point (#!/usr/bin/env node)
│   ├── lib/
│   │   ├── commands/
│   │   │   ├── setup.js          # Setup wizard
│   │   │   ├── start.js          # Start services
│   │   │   ├── stop.js           # Stop services
│   │   │   ├── status.js         # Service status
│   │   │   ├── logs.js           # Tail logs
│   │   │   ├── doctor.js         # Health checks
│   │   │   ├── update.js         # Self-update
│   │   │   └── device/
│   │   │       ├── add.js        # Add device wizard
│   │   │       ├── list.js       # List devices
│   │   │       └── remove.js     # Remove device
│   │   ├── config.js             # Config read/write
│   │   ├── docker.js             # Docker compose wrapper
│   │   ├── process-manager.js    # PID-based process management
│   │   ├── validators.js         # API key validation
│   │   └── utils.js              # Shared utilities
│   └── templates/
│       ├── config.default.json   # Default config structure
│       └── docker-compose.yml    # Template for voice-app
├── voice-app/                    # EXISTING: Unchanged
├── claude-api-server/            # EXISTING: Unchanged
└── docker-compose.yml            # EXISTING: Can be generated from template
```

---

## Dependencies

### External (CLI)

| Package | Version | Purpose |
|---------|---------|---------|
| commander | ^12.x | CLI command parsing |
| inquirer | ^9.x | Interactive prompts |
| chalk | ^5.x | Colored terminal output |
| ora | ^8.x | Spinners for async operations |
| axios | ^1.x | HTTP client for API validation |

### Internal

- Existing `voice-app/` - runs in Docker, no changes needed
- Existing `claude-api-server/` - runs natively, no changes needed
- Existing `docker-compose.yml` - template for generation

### Blockers

- [x] SPEC approved
- [ ] None - can start immediately

---

## Data Model

### Config File (~/.claude-phone/config.json)

```javascript
{
  "version": "1.0.0",
  "api": {
    "elevenlabs": {
      "apiKey": "sk-...",
      "validated": true
    },
    "openai": {
      "apiKey": "sk-...",
      "validated": true
    }
  },
  "sip": {
    "domain": "your-3cx.3cx.us",
    "registrar": "192.168.1.100",
    "transport": "udp"
  },
  "server": {
    "claudeApiPort": 3333,
    "httpPort": 3000,
    "externalIp": "auto"  // or specific IP
  },
  "devices": [
    {
      "name": "Morpheus",
      "extension": "9000",
      "authId": "9000",
      "password": "***",
      "voiceId": "elevenlabs-voice-id",
      "prompt": "You are Morpheus, a helpful AI assistant..."
    }
  ],
  "paths": {
    "voiceApp": "/path/to/voice-app",
    "claudeApiServer": "/path/to/claude-api-server"
  }
}
```

### Runtime Files (~/.claude-phone/)

| File | Purpose |
|------|---------|
| config.json | Main configuration |
| server.pid | PID of claude-api-server process |
| docker-compose.yml | Generated compose file |
| .env | Generated environment file |
| logs/ | Log files directory |

---

## CLI Commands

### Command Tree

```
claude-phone
├── setup              # Interactive setup wizard
├── start              # Start all services
├── stop               # Stop all services
├── restart            # Restart all services
├── status             # Show service status
├── logs [service]     # Tail logs (all, voice-app, api-server)
├── doctor             # Run health checks
├── update             # Self-update CLI
├── device
│   ├── add            # Add new device (wizard)
│   ├── list           # List configured devices
│   └── remove <name>  # Remove a device
└── config
    ├── show           # Show current config (redacted)
    ├── path           # Show config file path
    └── reset          # Reset to defaults (with confirm)
```

### Command Signatures

```javascript
// Main entry point
program
  .name('claude-phone')
  .description('Voice interface for Claude Code')
  .version(version);

// Setup command
program
  .command('setup')
  .description('Interactive setup wizard')
  .option('--reconfigure', 'Reconfigure existing setup')
  .action(setupCommand);

// Start command
program
  .command('start')
  .description('Start Claude Phone services')
  .option('--foreground', 'Run API server in foreground')
  .action(startCommand);

// Device subcommands
const device = program.command('device').description('Manage SIP devices');
device.command('add').description('Add a new device').action(deviceAddCommand);
device.command('list').description('List devices').action(deviceListCommand);
device.command('remove <name>').description('Remove device').action(deviceRemoveCommand);
```

---

## Key Workflows

### Install Flow

```bash
# install.sh pseudocode
1. Detect OS (uname -s)
2. Check prerequisites:
   - docker --version || exit "Install Docker first"
   - claude --version || warn "Claude CLI not found, needed for API server"
   - node --version >= 18 || exit "Node.js 18+ required"
3. Create temp directory
4. Download latest release tarball from GitHub
5. Extract to ~/.claude-phone/cli/
6. Symlink bin/claude-phone to ~/.local/bin/ or /usr/local/bin/
7. Verify: claude-phone --version
8. Print success + next steps
```

### Setup Wizard Flow

```javascript
// lib/commands/setup.js pseudocode
1. Welcome message
2. Check if config exists → offer reconfigure or fresh start
3. Prompt: ElevenLabs API key
   - Validate with test API call (list voices)
   - Show success/fail
4. Prompt: OpenAI API key
   - Validate with test API call (models list)
   - Show success/fail
5. Prompt: 3CX configuration
   - SIP domain
   - Registrar IP
   - (No validation - just collect)
6. Prompt: First device setup
   - Name (default: "Claude")
   - Extension (default: "9000")
   - Auth ID (default: same as extension)
   - Password
   - Voice ID (show list from ElevenLabs API)
   - System prompt (default provided, can customize)
7. Detect paths:
   - voice-app directory
   - claude-api-server directory
   - External IP (auto-detect or prompt)
8. Write config.json
9. Generate .env and docker-compose.yml
10. Run doctor to verify
11. Print success + "Run 'claude-phone start' to begin"
```

### Start Flow

```javascript
// lib/commands/start.js pseudocode
1. Load config
2. Verify not already running (check PID file, docker ps)
3. Generate fresh .env from config
4. Start voice-app:
   - docker compose -f ~/.claude-phone/docker-compose.yml up -d
   - Wait for healthy
5. Start claude-api-server:
   - spawn('node', ['server.js'], { detached: true, stdio: 'ignore' })
   - Write PID to server.pid
   - Wait for healthy (GET /health)
6. Print status table
7. Print "Claude Phone is running. Call extension XXXX to connect."
```

### Doctor Flow

```javascript
// lib/commands/doctor.js pseudocode
checks = [
  { name: 'Docker running', fn: checkDocker },
  { name: 'Claude CLI installed', fn: checkClaudeCli },
  { name: 'ElevenLabs API', fn: checkElevenLabs },
  { name: 'OpenAI API', fn: checkOpenAI },
  { name: 'Voice-app container', fn: checkVoiceAppContainer },
  { name: 'Claude API server', fn: checkClaudeApiServer },
  { name: 'SIP registration', fn: checkSipRegistration },
]

for each check:
  spinner.start(check.name)
  result = await check.fn()
  result.pass ? spinner.succeed() : spinner.fail(result.message)

Print summary: X/Y checks passed
```

---

## Test Strategy

### Unit Tests

Test core logic in isolation using Node's built-in test runner or Jest.

- [ ] `config.js` - read/write/validate config
- [ ] `validators.js` - API key validation (mock HTTP)
- [ ] `process-manager.js` - PID file operations
- [ ] `utils.js` - IP detection, path resolution

### Integration Tests

Test commands end-to-end (can use temp directories).

- [ ] `setup` command - mock prompts, verify config written
- [ ] `doctor` command - mock services, verify checks run
- [ ] `device add` command - verify device added to config

### What NOT to Test

- Docker internals (trust docker compose)
- Third-party APIs beyond validation (trust axios)
- Existing voice-app/claude-api-server (already working)

---

## Implementation Notes

### Gotchas

1. **External IP detection** - Tricky on multi-NIC systems. Provide auto-detect with manual override option.

2. **Docker socket permissions** - Linux users may need `sudo` or docker group. Detect and guide.

3. **Path differences Mac vs Linux** - Use `~/.local/bin` on Linux, `/usr/local/bin` on Mac (or detect writable PATH location).

4. **Node.js version** - Require 18+ for native fetch and modern features. Check in install script.

5. **Detached process stdio** - Must set `stdio: 'ignore'` or redirect to files for true detachment.

### Security Considerations

- **API keys stored in plaintext** - Document this, recommend file permissions `chmod 600 config.json`
- **PID file race conditions** - Check PID is actually our process before killing
- **No secrets in install script** - All secrets entered interactively, never in URLs

### Performance Considerations

- **Startup time** - Keep CLI snappy, lazy-load heavy deps
- **Validation timeout** - 5s timeout on API validation calls

---

## Rollout Plan

### Phase 1: CLI Core (MVP)

1. Create cli/ directory structure
2. Implement basic commands: setup, start, stop, status
3. Install script for Mac only
4. Manual testing

### Phase 2: Full Features

5. Add doctor command with all health checks
6. Add device management commands
7. Add logs command
8. Linux support in install script

### Phase 3: Polish

9. Add update command
10. Error handling and messaging polish
11. Documentation (README updates)
12. GitHub release automation

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Morpheus | 2026-01-07 | Draft |
| Tech Reviewer | Chuck | | Pending |

**Approved for Implementation:** [ ] Yes
