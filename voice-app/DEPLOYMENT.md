# Production Deployment Guide

Guide for deploying Claude Phone in production environments.

## Architecture Overview

Claude Phone consists of three Docker containers and an optional API server:

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Containers                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  drachtio   │  │ freeswitch  │  │     voice-app       │ │
│  │  (SIP)      │  │  (Media)    │  │   (Node.js app)     │ │
│  │  Port 5060  │  │ RTP 30000+  │  │   Port 3000         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     claude-api-server         │
              │     (Claude Code wrapper)     │
              │     Port 3333                 │
              └───────────────────────────────┘
```

## Network Requirements

### Ports

| Port | Protocol | Service | Direction |
|------|----------|---------|-----------|
| 5060 | UDP/TCP | SIP signaling (drachtio) | Inbound |
| 5070 | UDP/TCP | SIP signaling (if 3CX SBC present) | Inbound |
| 3000 | TCP | Voice app HTTP API | Inbound (optional) |
| 3333 | TCP | Claude API server | Internal |
| 30000-30100 | UDP | RTP audio (FreeSWITCH) | Bidirectional |

### Firewall Rules

For voice to work correctly, you must allow:

```bash
# SIP signaling
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp

# RTP audio (critical for audio to work)
sudo ufw allow 30000:30100/udp

# Voice app API (if exposing externally)
sudo ufw allow 3000/tcp
```

### NAT Considerations

The `EXTERNAL_IP` setting must be your server's LAN IP that can receive RTP packets. On NAT networks:

- Use your server's private IP (e.g., 192.168.1.50)
- Ensure RTP ports are forwarded if behind NAT
- 3CX handles NAT traversal for SIP; RTP is direct

## Docker Configuration

The CLI generates `~/.claude-phone/docker-compose.yml` automatically. Key settings:

### Network Mode

Voice-app uses `network_mode: host` for RTP to work correctly:

```yaml
voice-app:
  network_mode: host
```

This allows FreeSWITCH to bind RTP ports directly.

### RTP Port Range

FreeSWITCH uses ports 30000-30100 by default (configured to avoid conflict with 3CX SBC which uses 20000-20099):

```yaml
freeswitch:
  command: >
    --rtp-range-start 30000
    --rtp-range-end 30100
```

### Environment Variables

Key environment variables in the generated `.env`:

| Variable | Purpose |
|----------|---------|
| `EXTERNAL_IP` | Server LAN IP for RTP routing |
| `CLAUDE_API_URL` | URL to API server |
| `ELEVENLABS_API_KEY` | TTS API key |
| `GEMINI_API_KEY` | Gemini LLM API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Cloud Speech-to-Text credentials |
| `SIP_DOMAIN` | 3CX server FQDN |
| `SIP_REGISTRAR` | SIP registrar address |

## Split Deployment

### Voice Server (Pi/Linux)

Requirements:
- Docker and Docker Compose
- Network access to 3CX and API server
- Static IP recommended

The voice server runs Docker containers and connects to a remote API server:

```bash
claude-phone setup    # Select "Voice Server"
claude-phone start
```

### API Server (Mac/Linux with Claude Code)

Requirements:
- Node.js 18+
- Claude Code CLI installed and authenticated
- Network accessible from voice server

```bash
claude-phone api-server --port 3333
```

For persistent operation, use a process manager:

```bash
# Using pm2
npm install -g pm2
pm2 start "claude-phone api-server" --name claude-api

# Using systemd (Linux)
# Create /etc/systemd/system/claude-api.service
```

## Monitoring

### Health Checks

```bash
# Overall status
claude-phone status

# Comprehensive diagnostics
claude-phone doctor

# Container health
docker ps
docker compose logs -f
```

### Log Locations

```bash
# All logs
claude-phone logs

# Specific service
claude-phone logs voice-app
claude-phone logs drachtio
claude-phone logs freeswitch
```

### Key Log Messages

**Healthy startup:**
```
[SIP] Connected to drachtio
[SIP] Registered extension 9000 with 3CX
[HTTP] Server listening on port 3000
```

**Common errors:**
```
# Wrong external IP
AUDIO RTP REPORTS ERROR: [Bind Error]

# SIP registration failed
Registration failed: 401 Unauthorized

# API server unreachable
Error connecting to Claude API
```

## Security Considerations

### API Keys

- Config file has restricted permissions (chmod 600)
- Never commit `~/.claude-phone/config.json` to version control
- Use environment variables in CI/CD pipelines

### Network Security

- Voice app API (port 3000) should not be publicly exposed without authentication
- Claude API server (port 3333) should only be accessible from voice server
- Consider VPN for split deployments across networks

### SIP Security

- Use strong passwords for SIP extensions
- 3CX provides TLS for signaling; verify it's enabled
- Monitor for unusual call patterns

## Troubleshooting

### No Audio

1. Verify `EXTERNAL_IP` matches your server's LAN IP
2. Check RTP ports (30000-30100) are open
3. Ensure `network_mode: host` is set for voice-app
4. Check FreeSWITCH logs for RTP errors

### SIP Registration Fails

1. Verify 3CX extension credentials
2. Check SIP domain and registrar settings
3. Ensure port 5060 (or 5070) is not blocked
4. Verify no other service is using the SIP port

### API Server Connection Issues

1. Verify API server is running: `curl http://API_IP:3333/health`
2. Check firewall allows port 3333
3. Verify URL in voice server config matches API server

## Backup and Recovery

### Configuration Backup

```bash
claude-phone backup
```

Backups are stored in `~/.claude-phone/backups/` with timestamps.

### Recovery

```bash
claude-phone restore
```

Interactive selection of available backups.

### Manual Backup

```bash
cp -r ~/.claude-phone ~/.claude-phone.backup
```

## Updating

```bash
claude-phone update
```

This pulls the latest code and restarts services. Configuration is preserved.

## Uninstalling

```bash
claude-phone uninstall
```

This removes:
- Docker containers and images
- CLI installation
- Optionally: configuration files
