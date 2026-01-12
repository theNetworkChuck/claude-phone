# Raspberry Pi Deployment Specification

> Agree on WHAT before HOW. This document defines success criteria before any code is written.

## Overview

Deploy Claude Phone's voice-app (drachtio + FreeSWITCH) on a Raspberry Pi while claude-api-server runs on the user's Mac. This "split architecture" solves Docker Desktop networking issues on Mac (where `network_mode: host` gives the VM's IP instead of the Mac's LAN IP) and enables always-on voice capability. The Pi handles SIP/media, the Mac handles Claude Code CLI.

**Related Issue:** [#6 - Raspberry Pi deployment with split architecture](https://github.com/theNetworkChuck/claude-phone/issues/6)

## User Stories

### Primary

- As a **Mac user with Docker Desktop issues**, I want to run voice-app on a Raspberry Pi so I can have working SIP registration without networking hacks
- As a **homelabber**, I want an always-on voice server so Claude Phone is available 24/7 without keeping my Mac awake

### Secondary

- As a **user with existing 3CX SBC on Pi**, I want to add Claude Phone containers alongside my SBC so I don't need additional hardware
- As a **user with a fresh Pi**, I want a guided setup that installs everything I need from scratch

## Acceptance Criteria

Must be specific, testable conditions. Each becomes a test case.

### Core Functionality

- [ ] **AC1:** `claude-phone setup` detects Raspberry Pi OS (arm64) and enters Pi-specific setup flow
- [ ] **AC2:** Setup wizard asks for Mac's IP address where claude-api-server will run
- [ ] **AC3:** Setup wizard detects if 3CX SBC is already installed (port 5060 in use) and adapts accordingly
- [ ] **AC4:** If 3CX SBC detected: Configure drachtio on port 5070 automatically
- [ ] **AC5:** If no 3CX SBC: Configure drachtio on standard port 5060
- [ ] **AC6:** Generated `.env` file includes `CLAUDE_API_URL=http://[mac-ip]:3333`
- [ ] **AC7:** Docker compose starts successfully on Pi with ARM64 images
- [ ] **AC8:** voice-app registers with 3CX PBX from the Pi's actual LAN IP
- [ ] **AC9:** Inbound calls to configured extension reach voice-app on Pi
- [ ] **AC10:** voice-app successfully queries claude-api-server on Mac over LAN
- [ ] **AC11:** Full conversation loop works: call → speech → transcription → Claude → TTS → response

### Prerequisites & Mac-side

- [ ] **AC12:** Setup checks for Docker and docker-compose; if missing, displays prerequisite message with install link (does NOT auto-install)
- [ ] **AC13:** On Mac, `claude-phone api-server` command starts claude-api-server (replaces manual `node server.js`)
- [ ] **AC14:** `claude-phone api-server` accepts `--port` flag (default 3333)
- [ ] **AC15:** `claude-phone api-server` shows status: "Listening on port 3333, waiting for Pi connections..."

### Setup Experience

- [ ] **AC16:** `claude-phone setup` on Pi completes in under 5 minutes (excluding Docker image pulls)
- [ ] **AC17:** Clear instructions displayed for Mac-side setup (run `claude-phone api-server`)
- [ ] **AC18:** `claude-phone status` shows connection status to remote claude-api-server
- [ ] **AC19:** `claude-phone doctor` validates Pi ↔ Mac connectivity before first use

### Edge Cases

- [ ] **AC20:** Setup handles case where Mac's claude-api-server is not yet running (warns, doesn't fail)
- [ ] **AC21:** Setup validates Mac IP is reachable on LAN before saving config
- [ ] **AC22:** If ARM64 Docker images fail to pull, provide clear error with manual steps
- [ ] **AC23:** Handle case where user runs `claude-phone setup` on Pi but already has Mac config

### Error States

- [ ] **AC24:** If 3CX SBC port detection fails, prompt user to manually confirm port availability
- [ ] **AC25:** If drachtio fails to start (port conflict), provide specific remediation steps
- [ ] **AC26:** If Mac is unreachable during a call, voice-app plays error message and doesn't crash
- [ ] **AC27:** Timeout on claude-api-server connection shows helpful message (check Mac firewall, IP, etc.)

## Constraints

### Technical

- **Single Pi architecture only** - Two-Pi option deferred to future enhancement
- **Drachtio port:** 5070 when 3CX SBC present, 5060 otherwise
- **FreeSWITCH port:** 5080 (no conflict with 3CX SBC)
- **RTP ports:** 16384-16484/udp (must be open on Pi firewall)
- **Docker images:** Must use ARM64-compatible drachtio/freeswitch images
- **Pi model:** Raspberry Pi 4 or 5 only (arm64) - Pi 3 not supported
- **Network:** Ethernet recommended (WiFi adds latency/jitter for voice)

### Performance

- voice-app container should use < 300MB RAM at idle
- Call setup latency should be < 2 seconds (Pi processing only)
- LAN round-trip to Mac claude-api-server should be < 50ms

### Security

- `.env` file permissions set to 600 (owner read/write only)
- claude-api-server only accepts connections from configured Pi IP (optional hardening)
- No secrets stored in Docker image layers

## Out of Scope

Explicitly state what this feature does NOT do to prevent scope creep.

- **Two-Pi architecture** - Future enhancement, not v1
- **3CX SBC installation** - User installs 3CX SBC separately; we just detect it
- **Docker installation** - User installs Docker separately; we check and provide link but don't auto-install
- **Raspberry Pi 3 support** - arm64 only (Pi 4/5); armhf not supported
- **Remote/WAN deployment** - Only LAN connectivity supported; no cloud relay
- **Pi image/ISO** - No custom Raspberry Pi OS image; script installs on standard Raspbian
- **systemd services** - Running as Docker containers, not native systemd (future enhancement)

## Open Questions

All resolved.

- [x] ~~Can 3CX SBC coexist with Docker containers on same Pi?~~ **YES** - Research confirmed script-based install, port 5060 conflict solved by using 5070
- [x] ~~Should `claude-phone setup` on Pi also offer to install Docker if not present?~~ **NO** - Flag as prerequisite, provide install link, but don't auto-install (avoid stale installation scripts)
- [x] ~~Should we support Raspberry Pi 3 (armhf) or only Pi 4/5 (arm64)?~~ **Pi 4/5 only** - arm64 architecture only
- [x] ~~Should Mac-side have a matching `claude-phone api-server` command instead of manual `node server.js`?~~ **YES** - Add `claude-phone api-server` command for Mac

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Morpheus | 2026-01-12 | |
| Reviewer | Chuck | | Pending |

**Status:** DRAFT
