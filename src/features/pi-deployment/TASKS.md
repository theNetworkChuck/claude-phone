# Raspberry Pi Deployment Tasks

> Execution checklist. TDD-structured tasks derived from approved SPEC and PLAN.

**Spec:** [SPEC.md](./SPEC.md)
**Plan:** [PLAN.md](./PLAN.md)
**Status:** NOT STARTED

---

## Pre-Implementation

Verify before writing any code.

- [x] SPEC.md reviewed and approved
- [x] PLAN.md reviewed and approved
- [x] All open questions from SPEC resolved
- [x] All blockers from PLAN cleared
- [ ] Acceptance criteria clear and testable (27 ACs)
- [ ] Feature branch created: `feature/6-pi-deployment`

---

## Phase 1: Platform Detection Module

**File:** `cli/lib/platform.js`
**Tests:** `cli/test/platform.test.js`

### AC1: Platform detection

- [ ] Write failing test: `detectPlatform()` returns `{ os, arch, isPi }` object
- [ ] Implement `detectPlatform()` function
- [ ] Write failing test: `isPi` is `true` when arch is `arm64` AND `/proc/device-tree/model` contains "Raspberry Pi"
- [ ] Implement Pi detection logic
- [ ] Write failing test: `isPi` is `false` on Mac (darwin)
- [ ] Implement Mac detection
- [ ] Write failing test: `isPi` is `false` on x64 Linux
- [ ] Implement x64 Linux detection
- [ ] Write failing test: `getPiModel()` returns model string when on Pi
- [ ] Implement `getPiModel()` function
- [ ] Refactor while green

---

## Phase 2: Prerequisites Module

**File:** `cli/lib/prerequisites.js`
**Tests:** `cli/test/prerequisites.test.js`

### AC12: Docker prerequisite check

- [ ] Write failing test: `checkDocker()` returns `{ installed: true, version }` when Docker is present
- [ ] Implement Docker check via `which docker` and `docker --version`
- [ ] Write failing test: `checkDocker()` returns `{ installed: false, installUrl }` when Docker missing
- [ ] Implement missing Docker handling with install URL
- [ ] Write failing test: `checkDockerCompose()` returns `{ installed: true }` when available
- [ ] Implement docker-compose check
- [ ] Write failing test: `checkPiPrerequisites()` returns array of all prerequisite results
- [ ] Implement combined check function
- [ ] Refactor while green

---

## Phase 3: Port Check Module

**File:** `cli/lib/port-check.js`
**Tests:** `cli/test/port-check.test.js`

### AC3, AC4, AC5: 3CX SBC detection and port configuration

- [ ] Write failing test: `checkPort(5060)` returns `{ inUse: true }` when port is bound
- [ ] Implement port check via `net.connect()`
- [ ] Write failing test: `checkPort(5060)` returns `{ inUse: false }` when port is free
- [ ] Implement free port detection
- [ ] Write failing test: `detect3cxSbc()` returns `true` when port 5060 is in use
- [ ] Implement 3CX SBC detection
- [ ] Write failing test: `detect3cxSbc()` returns `false` when port 5060 is free
- [ ] Implement no-SBC case
- [ ] Write failing test: Port check times out after 1 second
- [ ] Implement timeout handling
- [ ] Refactor while green

---

## Phase 4: Network Validation Module

**File:** `cli/lib/network.js`
**Tests:** `cli/test/network.test.js`

### AC21: Mac IP validation

- [ ] Write failing test: `isReachable('192.168.1.100')` returns `true` for reachable IP
- [ ] Implement IP reachability check
- [ ] Write failing test: `isReachable('192.168.1.254')` returns `false` for unreachable IP
- [ ] Implement unreachable handling
- [ ] Write failing test: `isReachable()` times out after 3 seconds
- [ ] Implement timeout
- [ ] Write failing test: `checkClaudeApiServer('http://192.168.1.100:3333')` returns `{ reachable: true, healthy: true }` when server responds
- [ ] Implement API server health check
- [ ] Write failing test: `checkClaudeApiServer()` returns `{ reachable: true, healthy: false }` when server responds but unhealthy
- [ ] Implement unhealthy detection
- [ ] Write failing test: `checkClaudeApiServer()` returns `{ reachable: false }` when server unreachable
- [ ] Implement unreachable handling
- [ ] Refactor while green

---

## Phase 5: Config Schema Extension

**File:** `cli/lib/config.js`
**Tests:** `cli/test/config.test.js` (extend existing)

### AC6: Config with deployment mode

- [ ] Write failing test: New config has `deployment.mode` field defaulting to `'standard'`
- [ ] Extend `createDefaultConfig()` with deployment schema
- [ ] Write failing test: Pi config has `deployment.mode = 'pi-split'`
- [ ] Implement Pi config generation
- [ ] Write failing test: Pi config includes `deployment.pi.macApiUrl`
- [ ] Implement Mac API URL storage
- [ ] Write failing test: Pi config includes `deployment.pi.drachtioPPort` (5060 or 5070)
- [ ] Implement port configuration storage
- [ ] Write failing test: Config version bumps to `1.1.0` for new schema
- [ ] Implement version bump
- [ ] Write failing test: Loading v1.0.0 config auto-migrates to v1.1.0
- [ ] Implement backward compatibility migration
- [ ] Refactor while green

---

## Phase 6: Setup Command Enhancement

**File:** `cli/lib/commands/setup.js`
**Tests:** Manual testing (setup is interactive)

### AC1, AC2: Pi-specific setup flow

- [ ] Add platform detection at start of `setupCommand()`
- [ ] Branch into `setupPi()` when Pi detected
- [ ] Implement `setupPi()` function skeleton

### AC12: Docker prerequisite check in setup

- [ ] Add Docker check to Pi setup flow
- [ ] Display prerequisite error with install link if Docker missing
- [ ] Block setup if Docker not installed (with instructions)

### AC3, AC4, AC5: SBC detection and port config

- [ ] Add 3CX SBC detection prompt to Pi setup
- [ ] If SBC detected: set drachtio port to 5070
- [ ] If no SBC: set drachtio port to 5060
- [ ] Display port configuration to user

### AC2, AC21: Mac IP collection and validation

- [ ] Add prompt for Mac IP address
- [ ] Validate IP format
- [ ] Check if IP is reachable on LAN
- [ ] Warn if unreachable, allow continue

### AC6: Generate Pi config

- [ ] Generate `.env` with `CLAUDE_API_URL=http://[mac-ip]:3333`
- [ ] Set correct drachtio port in docker-compose
- [ ] Save deployment mode to config

### AC17: Mac setup instructions

- [ ] Display Mac-side setup instructions at end of Pi setup
- [ ] Show: "On your Mac, run: claude-phone api-server"

---

## Phase 7: API Server Command

**File:** `cli/lib/commands/api-server.js`
**Tests:** `cli/test/api-server.test.js`

### AC13, AC14, AC15: Mac api-server command

- [ ] Write failing test: `apiServerCommand()` starts server on default port 3333
- [ ] Implement basic server start
- [ ] Write failing test: `apiServerCommand({ port: 4000 })` starts on specified port
- [ ] Implement port flag handling
- [ ] Write failing test: Server displays "Listening on port X, waiting for Pi connections..."
- [ ] Implement status message
- [ ] Write failing test: Server handles graceful shutdown on SIGINT
- [ ] Implement shutdown handling
- [ ] Add command to `bin/claude-phone.js`
- [ ] Refactor while green

---

## Phase 8: Status Command Enhancement

**File:** `cli/lib/commands/status.js`

### AC18: Remote API status display

- [ ] Detect if config is `pi-split` mode
- [ ] If Pi mode: check remote `macApiUrl` connectivity
- [ ] Display connection status: "Claude API Server: Connected" or "Disconnected"
- [ ] Show Mac IP and port in status output

---

## Phase 9: Doctor Command Enhancement

**File:** `cli/lib/commands/doctor.js`

### AC19: Pi ↔ Mac connectivity validation

- [ ] Add Pi-specific checks when in `pi-split` mode
- [ ] Check: Is Mac IP reachable?
- [ ] Check: Is claude-api-server responding on Mac?
- [ ] Check: Is drachtio running on correct port?
- [ ] Display clear pass/fail for each check
- [ ] Provide remediation steps for failures

---

## Phase 10: Docker Compose Generation

**File:** `cli/lib/docker.js`

### AC4, AC5, AC7: Pi-specific compose

- [ ] Modify `generateDockerCompose()` to accept drachtio port parameter
- [ ] Generate compose with port 5070 when SBC detected
- [ ] Generate compose with port 5060 when no SBC
- [ ] Ensure ARM64 image tags are used (verify multi-arch support)

---

## Phase 11: Edge Cases

### AC20: Mac not running during setup

- [ ] Warn user if Mac API server not reachable during setup
- [ ] Allow setup to continue (don't fail)
- [ ] Remind user to start api-server on Mac

### AC22: ARM64 image pull failure

- [ ] Detect ARM64 image pull errors
- [ ] Display clear error message
- [ ] Provide manual docker pull commands

### AC23: Existing Mac config on Pi

- [ ] Detect if running setup on Pi but config has `mode: 'standard'`
- [ ] Offer migration path
- [ ] Preserve API keys and devices from existing config

---

## Phase 12: Error States

### AC24: Port detection failure

- [ ] Handle case where port check fails (permission denied, etc.)
- [ ] Prompt user to manually confirm 3CX SBC status
- [ ] Allow manual port override

### AC25: Drachtio start failure

- [ ] Detect drachtio container failure on start
- [ ] Check if port conflict is the cause
- [ ] Display specific remediation: "Port 5060 in use. Try port 5070?"

### AC26: Mac unreachable during call

- [ ] voice-app: Add timeout handling for claude-api-server requests
- [ ] Play error message to caller: "I'm having trouble connecting. Please try again later."
- [ ] Don't crash on connection failure

### AC27: Claude API timeout

- [ ] Implement request timeout (30 seconds)
- [ ] Display helpful error: "Check Mac firewall, verify claude-phone api-server is running"

---

## Verification

All must pass before review.

- [ ] All unit tests passing (`npm test` in cli/)
- [ ] All integration tests passing
- [ ] No linter errors (`npm run lint`)
- [ ] All 27 acceptance criteria from SPEC met
- [ ] No secrets in code
- [ ] Config migration tested (v1.0.0 → v1.1.0)

---

## Manual Testing Checklist

Must complete on actual hardware.

- [ ] Run `claude-phone setup` on Raspberry Pi 4 or 5
- [ ] Verify Pi detection works correctly
- [ ] Verify Docker prerequisite check (with and without Docker)
- [ ] Test 3CX SBC detection (with SBC running)
- [ ] Test 3CX SBC detection (without SBC)
- [ ] Verify port 5070 configured when SBC present
- [ ] Verify port 5060 configured when no SBC
- [ ] Test Mac IP validation (reachable and unreachable)
- [ ] Run `claude-phone api-server` on Mac
- [ ] Verify `claude-phone status` shows Pi ↔ Mac connectivity
- [ ] Run `claude-phone doctor` and verify all checks pass
- [ ] Make test call: phone → Pi → Mac → Claude → response
- [ ] Test error case: Mac unreachable during call

---

## Documentation

- [ ] CLAUDE.md updated with Pi deployment section
- [ ] README.md updated with Pi setup instructions
- [ ] Add `RASPBERRY-PI.md` deployment guide
- [ ] Code comments for non-obvious logic

---

## Ready for Review

- [ ] Self-review complete (re-read all changes)
- [ ] All tests passing
- [ ] Manual testing on Pi complete
- [ ] PR created with description
- [ ] Ready for Paul review

---

## Notes

*Implementation notes will be added during build phase.*

---

## Summary

| Phase | Module/File | ACs Covered |
|-------|-------------|-------------|
| 1 | platform.js | AC1 |
| 2 | prerequisites.js | AC12 |
| 3 | port-check.js | AC3, AC4, AC5 |
| 4 | network.js | AC21 |
| 5 | config.js | AC6 |
| 6 | setup.js | AC1-6, AC12, AC17, AC21 |
| 7 | api-server.js | AC13-15 |
| 8 | status.js | AC18 |
| 9 | doctor.js | AC19 |
| 10 | docker.js | AC4, AC5, AC7 |
| 11 | Edge cases | AC20, AC22, AC23 |
| 12 | Error states | AC24-27 |
