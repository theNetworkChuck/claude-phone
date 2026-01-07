# Claude Phone

Voice interface for Claude Code via SIP/3CX. Call your AI, and your AI can call you.

## Project Overview

Claude Phone gives your Claude Code installation a phone number through 3CX PBX integration:
- **Inbound**: Call an extension and talk to Claude - run commands, check status, ask questions
- **Outbound**: Your server can call YOU with alerts, then have a conversation about what to do

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | Node.js (ES5-style, CommonJS) |
| SIP Server | drachtio-srf |
| Media Server | FreeSWITCH (via drachtio-fsmrf) |
| STT | OpenAI Whisper API |
| TTS | ElevenLabs API |
| AI Backend | Claude Code CLI (via HTTP wrapper) |
| PBX | 3CX (any SIP-compatible works) |
| Container | Docker Compose |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Phone Call                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← PBX routes the call                    │
│  └──────┬──────┘                                            │
│         │ SIP                                               │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────────┐       │
│  │           voice-app (Docker)                     │       │
│  │  ┌─────────────────────────────────────────┐   │       │
│  │  │ drachtio  │  FreeSWITCH  │  Node.js     │   │       │
│  │  │ (SIP)     │  (Media)     │  (Logic)     │   │       │
│  │  └─────────────────────────────────────────┘   │       │
│  └────────────────────┬────────────────────────────┘       │
│                       │ HTTP                                │
│                       ↓                                      │
│  ┌─────────────────────────────────────────────────┐       │
│  │   claude-api-server (runs on Mac with Claude)   │       │
│  │   Wraps Claude Code CLI with session management │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
claude-phone/
├── CLAUDE.md                 # This file
├── README.md                 # User-facing documentation
├── package.json              # Root package (hooks, linting)
├── eslint.config.js          # ESLint configuration
├── docker-compose.yml        # Multi-container orchestration
├── .env.example              # Environment template
├── .gitignore
├── .husky/                   # Git hooks (pre-commit)
│   └── pre-commit            # Runs lint before commits
├── voice-app/                # Docker container for voice handling
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js              # Main entry point (v9)
│   ├── config/
│   │   └── devices.json      # Device configurations
│   ├── lib/
│   │   ├── audio-fork.js     # WebSocket audio streaming
│   │   ├── claude-bridge.js  # HTTP client for Claude API
│   │   ├── conversation-loop.js  # Core conversation flow
│   │   ├── device-registry.js    # Multi-device management
│   │   ├── http-server.js    # Express server for audio/API
│   │   ├── logger.js         # Logging utility
│   │   ├── multi-registrar.js    # Multi-extension SIP registration
│   │   ├── outbound-handler.js   # Outbound call logic
│   │   ├── outbound-routes.js    # Outbound API endpoints
│   │   ├── outbound-session.js   # Outbound call sessions
│   │   ├── query-routes.js   # Query API endpoints
│   │   ├── registrar.js      # Single SIP registration
│   │   ├── sip-handler.js    # Inbound call handling
│   │   ├── tts-service.js    # ElevenLabs TTS
│   │   └── whisper-client.js # OpenAI Whisper STT
│   ├── DEPLOYMENT.md         # Production deployment guide
│   ├── README-OUTBOUND.md    # Outbound calling docs
│   └── API-QUERY-CONTRACT.md # Query API specification
└── claude-api-server/        # HTTP wrapper for Claude CLI
    ├── package.json
    ├── server.js             # Express server
    └── structured.js         # JSON validation helpers
```

## Key Commands

```bash
# Start voice-app (Docker)
docker compose up -d

# View logs
docker compose logs -f voice-app

# Start claude-api-server (on Mac with Claude Code)
cd claude-api-server && node server.js

# Test outbound call
curl -X POST http://localhost:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{"to": "+15551234567", "message": "Test alert", "device": "Morpheus"}'

# Check call status
curl http://localhost:3000/api/calls
```

## Development Workflow

### Slash Commands (DevFlow)

| Command | Purpose |
|---------|---------|
| `/feature spec [name]` | Create feature specification with acceptance criteria |
| `/feature start [name]` | Start building a feature (reads spec if exists) |
| `/feature ship` | Run checks, review, and merge feature |
| `/project init` | Initialize new project structure |

### Git Hooks

Pre-commit hook runs automatically:
```bash
npm run precommit  # Runs ESLint on all JS files
```

### Linting

```bash
# Lint entire project
npm run lint

# Lint with auto-fix
npm run lint:fix

# Lint specific directory
npm run lint:voice-app
npm run lint:api-server
```

ESLint is configured for ES5-style CommonJS JavaScript. Rules focus on catching bugs (undefined vars, redeclarations) while being lenient on style (quotes, indentation) to match existing code.

## API Endpoints

### Voice App (port 3000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/outbound-call` | Initiate an outbound call |
| GET | `/api/call/:callId` | Get call status |
| GET | `/api/calls` | List active calls |
| POST | `/api/query` | Query a device programmatically |
| GET | `/api/devices` | List configured devices |

### Claude API Server (port 3333)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ask` | Send prompt to Claude (voice) |
| POST | `/ask-structured` | Send prompt, return validated JSON |
| POST | `/end-session` | Clean up call session |
| GET | `/health` | Health check |

## Conversation Flow

1. **Ready Beep** - Signal "your turn to speak"
2. **VAD Detection** - Wait for speech (or DTMF # to send early)
3. **Got-it Beep** - Signal "I heard you, processing"
4. **Whisper Transcription** - STT via OpenAI
5. **Thinking Phrase** - Random feedback ("Pondering...", "Cogitating...")
6. **Hold Music** - Background audio during Claude processing
7. **Claude Query** - Send to Claude API with session context
8. **TTS Response** - ElevenLabs voices the response
9. **Repeat** - Loop until goodbye or max turns

## Device Personalities

Each SIP extension can have its own identity:

| Device | Extension | Purpose |
|--------|-----------|---------|
| Morpheus | 9000 | General assistant (default) |
| Cephanie | 9002 | Storage monitoring bot |

Configured in `voice-app/config/devices.json`:
```json
{
  "9002": {
    "name": "Cephanie",
    "extension": "9002",
    "authId": "xxx",
    "password": "xxx",
    "voiceId": "ElevenLabs-voice-id",
    "prompt": "You are Cephanie, the Ceph storage monitoring AI..."
  }
}
```

## Voice Response Format

Claude responses must include for voice:

```
🗣️ VOICE_RESPONSE: [Conversational answer, 40 words max - spoken via TTS]
🎯 COMPLETED: [Status summary, 12 words max - for logging]
```

The VOICE_CONTEXT prompt in `claude-api-server/server.js` enforces this format.

## Environment Variables

Critical variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `EXTERNAL_IP` | Server LAN IP (for RTP audio routing) |
| `CLAUDE_API_URL` | URL to claude-api-server |
| `ELEVENLABS_API_KEY` | TTS API key |
| `OPENAI_API_KEY` | Whisper STT API key |
| `SIP_DOMAIN` | 3CX server hostname |
| `SIP_REGISTRAR` | 3CX SIP registrar IP |

## Current Phase

**Production Ready** - Initial commit complete, all core features working:
- [x] Inbound calls with VAD, Whisper, Claude, ElevenLabs
- [x] Outbound calls with conversation mode
- [x] Multi-device support with per-device voices/prompts
- [x] Query API for programmatic access
- [x] Session management for multi-turn conversations
- [x] Hold music and audio cues

## Key Decisions

1. **ES5-style CommonJS** - Compatibility with drachtio ecosystem
2. **Host networking mode** - Required for FreeSWITCH RTP to reach 3CX
3. **Separate claude-api-server** - Runs on Mac with Claude Code CLI (needs Claude Max subscription)
4. **Session-per-call** - Each call gets a Claude session for multi-turn context
5. **VAD + DTMF #** - Dual input methods (voice activity detection + manual send)

## Known Issues

None documented yet. This is the initial commit.

## Future Enhancements

Potential features for later:
- [ ] Webhook notifications for call events
- [ ] Call recording and transcripts
- [ ] Multiple language support
- [ ] Custom wake words
- [ ] Integration with calendar/reminders
