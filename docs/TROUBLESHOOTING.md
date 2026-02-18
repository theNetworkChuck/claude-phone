# Troubleshooting Guide

Common issues and solutions for Claude Phone.

## Quick Diagnostics

Start here for most problems:

```bash
claude-phone doctor   # Automated health checks
claude-phone status   # Service status overview
claude-phone logs     # View recent logs
```

## Setup Issues

### "API key validation failed"

**Symptom:** Setup fails when validating ElevenLabs or OpenAI key.

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Key is incorrect | Double-check you copied the full key |
| No billing enabled | Add payment method to your account |
| Account suspended | Check account status on provider dashboard |
| Network issue | Check internet connectivity |

**For OpenAI specifically:**
- New accounts need billing enabled before API works
- Free tier credits expire after 3 months
- Check [platform.openai.com/account/billing](https://platform.openai.com/account/billing)

**For ElevenLabs:**
- Free tier has limited characters/month
- Check [elevenlabs.io/subscription](https://elevenlabs.io/subscription)

### "Can't detect 3CX SBC"

**Symptom:** Setup can't connect to your 3CX server.

**Solutions:**
1. Verify 3CX FQDN is correct (e.g., `yourcompany.3cx.us`)
2. Ensure 3CX SBC (Session Border Controller) is enabled
3. Check firewall allows port 5060 (SIP) outbound
4. Try using port 5070 if 5060 is blocked

### "Docker not found" or "Docker not running"

**Symptom:** Prerequisite check fails for Docker.

**Solutions:**

**macOS:**
```bash
# Install Docker Desktop
brew install --cask docker
# Then launch Docker Desktop from Applications
```

**Linux (Debian/Ubuntu):**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
```

**Raspberry Pi:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi
# Reboot the Pi
```

### "claude-phone: command not found"

**Symptom:** Your shell cannot find the `claude-phone` command.

**Solutions:**
1. Run from the repo directly:
   ```bash
   node cli/bin/claude-phone.js --version
   node cli/bin/claude-phone.js start
   ```
2. Re-install the global CLI link:
   ```bash
   cd /path/to/claude-phone/cli
   npm link
   hash -r
   ```
3. Open a new terminal and retry `claude-phone --version`.

## Connection Issues

### Calls don't connect at all

**Symptom:** Phone rings forever or immediately fails.

**Checklist:**
1. Is the extension registered with 3CX?
   ```bash
   claude-phone status
   # Look for "SIP Registration: OK"
   ```

2. Is the SIP domain correct?
   ```bash
   claude-phone config show
   # Check sip.domain matches your 3CX FQDN
   ```

3. Are credentials correct?
   - Log into 3CX admin panel
   - Check extension auth ID and password match config

4. Is drachtio container running?
   ```bash
   docker ps | grep drachtio
   ```

### Extension not registering with 3CX

**Symptom:** `claude-phone status` shows SIP registration failed.

**Solutions:**
1. Verify extension exists in 3CX
2. Check auth ID matches (usually same as extension number)
3. Verify password is correct
4. Ensure SBC is enabled in 3CX settings
5. Check if another device is using the same extension

### Calls connect but no audio

**Symptom:** Call connects, you can see it's answered, but there's silence.

**Most common cause:** Wrong `EXTERNAL_IP` setting.

**Fix:**
```bash
# Find your server's LAN IP
ip addr show | grep "inet " | grep -v 127.0.0.1

# Re-run setup to fix
claude-phone setup
# Enter correct IP when prompted for "External IP"
```

**Other causes:**
- RTP ports blocked by firewall (needs 30000-30100 UDP)
- NAT issues (server can't receive return audio)
- FreeSWITCH container unhealthy

### RTP Port Conflict (3CX SBC)

**Symptom:** Calls fail with "INCOMPATIBLE_DESTINATION" error. Logs show `AUDIO RTP REPORTS ERROR: [Bind Error! IP:port]`.

**Cause:** 3CX SBC uses RTP ports 20000-20099. If FreeSWITCH uses the same range, it can't bind.

**Fix:** Claude Phone uses ports 30000-30100 by default. If you upgraded from an older version:

```bash
# Check current port config
grep "rtp-range" ~/.claude-phone/docker-compose.yml

# If it shows 20000, update to 30000:
sed -i 's/--rtp-range-start 20000/--rtp-range-start 30000/' ~/.claude-phone/docker-compose.yml
sed -i 's/--rtp-range-end 20100/--rtp-range-end 30100/' ~/.claude-phone/docker-compose.yml

# Restart services
claude-phone stop
claude-phone start
```

## Runtime Issues

### "Sorry, something went wrong" on every call

**Symptom:** Calls connect, but the assistant always says there was an error.

**Causes:**

1. **API server unreachable:**
   ```bash
   claude-phone status
   # Check "Claude API Server" status

   # For split deployments, verify connectivity:
   curl http://<api-server-ip>:3333/health
   ```

2. **Selected backend is not working:**
   ```bash
   # On the API server machine:
   curl http://localhost:3333/health

   # If backend is claude:
   claude --version

   # If backend is codex:
   codex --version

   # If backend is openai:
   # Ensure OPENAI_API_KEY is set and valid
   ```

3. **Session errors:**
   ```bash
   claude-phone logs voice-app | grep -i error
   ```

### Whisper transcription errors

**Symptom:** Claude responds to wrong words or doesn't understand speech.

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| OpenAI billing exhausted | Add credits to OpenAI account |
| Audio quality poor | Check microphone, reduce background noise |
| Network latency | Audio chunks may be lost; check connection |

### ElevenLabs TTS errors

**Symptom:** Claude's responses aren't spoken, or voice sounds wrong.

**Solutions:**
1. Check ElevenLabs character quota isn't exhausted
2. Verify voice ID is valid: `claude-phone device list`
3. Check API key still works

### Calls disconnect after a few seconds

**Symptom:** Call connects, maybe plays greeting, then drops.

**Causes:**
- FreeSWITCH timeout (check logs)
- SIP session timeout
- Network instability

```bash
# Check FreeSWITCH logs for clues
claude-phone logs freeswitch | tail -100
```

## Split Deployment Issues

### Pi can't reach API server

**Symptom:** Voice services start but calls fail with connection errors.

**Diagnostics:**
```bash
# On the Pi, test connectivity:
curl http://<api-server-ip>:3333/health

# Check configured API URL:
claude-phone config show | grep claudeApiUrl
```

**Solutions:**
1. Verify API server IP is correct in Pi's config
2. Ensure API server is running: `claude-phone api-server`
3. Check firewall allows port 3333
4. Verify both machines are on same network (or have routing)

### API server won't start

**Symptom:** `claude-phone api-server` fails immediately.

**Solutions:**
1. Check port 3333 isn't already in use:
   ```bash
   lsof -i :3333
   ```

2. Verify selected backend prerequisites:
   ```bash
   curl http://localhost:3333/health
   # backend=claude  -> claude --version
   # backend=codex   -> codex --version
   # backend=openai  -> OPENAI_API_KEY must be set
   ```

3. **OpenAI backend has no web results:**
   ```bash
   # Check OpenAI backend + web search config:
   curl http://localhost:3333/health
   # Look for: backend=openai, openai.webSearchEnabled=true

   # Explicitly enable if needed:
   export OPENAI_WEB_SEARCH_ENABLED=true
   export OPENAI_WEB_SEARCH_TYPE=web_search
   claude-phone api-server --backend openai
   ```

4. Check for Node.js errors in output

## Getting Logs

### Voice App Logs
```bash
claude-phone logs voice-app
# or
docker compose logs -f voice-app
```

### SIP Server Logs
```bash
claude-phone logs drachtio
# or
docker compose logs -f drachtio
```

### Media Server Logs
```bash
claude-phone logs freeswitch
# or
docker compose logs -f freeswitch
```

### API Server Logs
```bash
# If running in foreground, check terminal output
# If running via start command, check:
cat ~/.claude-phone/api-server.log
```

## Still Stuck?

1. **Check the video tutorial:** [youtu.be/cT22fTzotYc](https://youtu.be/cT22fTzotYc) covers common setup issues
2. **Run full diagnostics:** `claude-phone doctor`
3. **Open an issue:** [github.com/networkchuck/claude-phone/issues](https://github.com/networkchuck/claude-phone/issues)

When opening an issue, include:
- Output of `claude-phone doctor`
- Output of `claude-phone status`
- Relevant log snippets (redact any API keys!)
- Your deployment type (All-in-one or Split)
- Platform (macOS, Linux, Raspberry Pi)
