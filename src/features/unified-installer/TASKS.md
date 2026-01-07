# Unified Installer Tasks

> Execution checklist. TDD-structured tasks derived from approved SPEC and PLAN.

**Spec:** [SPEC.md](./SPEC.md)
**Plan:** [PLAN.md](./PLAN.md)
**Status:** NOT STARTED

---

## Pre-Implementation

- [x] SPEC.md reviewed and approved
- [x] PLAN.md reviewed and approved
- [x] All open questions from SPEC resolved
- [x] All blockers from PLAN cleared
- [x] Acceptance criteria clear and testable (31 ACs)
- [ ] Feature branch created: `feature/unified-installer`

---

## Phase 1: CLI Core (MVP)

### 1.1 Project Setup

- [ ] Create `cli/` directory structure per PLAN
- [ ] Initialize `cli/package.json` with dependencies
- [ ] Create `cli/bin/claude-phone.js` entry point with shebang
- [ ] Set up Commander.js base with version command
- [ ] Verify `node cli/bin/claude-phone.js --version` works

### 1.2 Config Module

- [ ] **Test**: config.js reads config from ~/.claude-phone/config.json
- [ ] **Implement**: `loadConfig()` function
- [ ] **Test**: config.js writes config with correct permissions (600)
- [ ] **Implement**: `saveConfig()` function
- [ ] **Test**: config.js returns defaults when no config exists
- [ ] **Implement**: `getConfigPath()` and default config template
- [ ] **Refactor**: Extract config schema validation

### 1.3 Setup Command (AC-6 through AC-12)

- [ ] **Test**: setup command launches without error
- [ ] **Implement**: Basic `setup.js` command structure
- [ ] **Test**: ElevenLabs key validation makes API call
- [ ] **Implement**: ElevenLabs validator (list voices endpoint) [AC-7]
- [ ] **Test**: OpenAI key validation makes API call
- [ ] **Implement**: OpenAI validator (models endpoint) [AC-8]
- [ ] **Test**: Setup prompts for all required 3CX fields
- [ ] **Implement**: 3CX credential prompts [AC-9]
- [ ] **Test**: Setup prompts for first device
- [ ] **Implement**: Device setup prompts (name, extension, voice, prompt) [AC-10]
- [ ] **Test**: Setup writes valid config.json
- [ ] **Implement**: Config persistence [AC-11]
- [ ] **Test**: Setup can reconfigure existing config
- [ ] **Implement**: Reconfigure flow [AC-12]
- [ ] **Refactor**: Extract validators to separate module

### 1.4 Process Manager Module

- [ ] **Test**: process-manager writes PID file
- [ ] **Implement**: `writePid()` function
- [ ] **Test**: process-manager reads PID and checks if running
- [ ] **Implement**: `isRunning()` function
- [ ] **Test**: process-manager kills process by PID
- [ ] **Implement**: `stopProcess()` function
- [ ] **Test**: process-manager spawns detached Node process
- [ ] **Implement**: `startApiServer()` function

### 1.5 Docker Module

- [ ] **Test**: docker.js checks if Docker is running
- [ ] **Implement**: `isDockerRunning()` function
- [ ] **Test**: docker.js generates docker-compose.yml from config
- [ ] **Implement**: `generateComposeFile()` function
- [ ] **Test**: docker.js starts containers
- [ ] **Implement**: `startContainers()` function
- [ ] **Test**: docker.js stops containers
- [ ] **Implement**: `stopContainers()` function
- [ ] **Test**: docker.js gets container status
- [ ] **Implement**: `getContainerStatus()` function

### 1.6 Start Command (AC-19, AC-20)

- [ ] **Test**: start command fails gracefully if not configured
- [ ] **Implement**: Config existence check
- [ ] **Test**: start command launches Docker containers
- [ ] **Implement**: Docker startup with status output [AC-20]
- [ ] **Test**: start command launches claude-api-server
- [ ] **Implement**: API server startup with PID tracking
- [ ] **Test**: start command shows final status
- [ ] **Implement**: Status summary after startup [AC-19]

### 1.7 Stop Command (AC-21)

- [ ] **Test**: stop command stops Docker containers
- [ ] **Implement**: Docker shutdown
- [ ] **Test**: stop command stops claude-api-server via PID
- [ ] **Implement**: API server shutdown [AC-21]
- [ ] **Test**: stop command handles already-stopped state gracefully

### 1.8 Status Command (AC-22)

- [ ] **Test**: status command shows Docker container state
- [ ] **Implement**: Container status display
- [ ] **Test**: status command shows API server state
- [ ] **Implement**: API server status via PID check [AC-22]

### 1.9 Install Script (AC-1 through AC-5)

- [ ] Create `install.sh` for Mac (Darwin detection) [AC-2]
- [ ] **Test**: install.sh checks for Docker [AC-3]
- [ ] **Implement**: Docker prerequisite check with helpful error
- [ ] **Test**: install.sh checks for Claude CLI [AC-4]
- [ ] **Implement**: Claude CLI check with install instructions
- [ ] **Test**: install.sh downloads and extracts tarball
- [ ] **Implement**: GitHub release download logic [AC-1]
- [ ] **Test**: install.sh creates symlink in PATH [AC-5]
- [ ] **Implement**: PATH setup for Mac (/usr/local/bin)
- [ ] Manual test: Full install flow on Mac

---

## Phase 2: Full Features

### 2.1 Doctor Command (AC-13 through AC-18)

- [ ] **Test**: doctor command structure with multiple checks
- [ ] **Implement**: Check runner with pass/fail display [AC-13]
- [ ] **Test**: ElevenLabs connectivity check
- [ ] **Implement**: ElevenLabs health check [AC-14]
- [ ] **Test**: OpenAI connectivity check
- [ ] **Implement**: OpenAI health check [AC-15]
- [ ] **Test**: Claude CLI accessibility check
- [ ] **Implement**: Claude CLI check (claude --version) [AC-16]
- [ ] **Test**: Docker running check
- [ ] **Implement**: Docker daemon check [AC-17]
- [ ] **Test**: Summary with actionable messages
- [ ] **Implement**: Clear error messages for failures [AC-18]

### 2.2 Device Management (AC-24 through AC-27)

- [ ] Create `cli/lib/commands/device/` directory
- [ ] **Test**: device add wizard prompts for all fields
- [ ] **Implement**: `device add` command with Inquirer [AC-24, AC-25]
- [ ] **Test**: device list shows all configured devices
- [ ] **Implement**: `device list` command with table output [AC-26]
- [ ] **Test**: device remove deletes device from config
- [ ] **Implement**: `device remove <name>` command [AC-27]
- [ ] **Test**: device remove requires confirmation

### 2.3 Logs Command (AC-23)

- [ ] **Test**: logs command tails Docker logs
- [ ] **Implement**: Docker logs streaming
- [ ] **Test**: logs command tails API server logs
- [ ] **Implement**: API server log tailing
- [ ] **Test**: logs command combines both outputs [AC-23]

### 2.4 Linux Support

- [ ] Update `install.sh` with Linux detection [AC-2]
- [ ] **Test**: Linux uses ~/.local/bin for symlink
- [ ] **Implement**: Linux PATH setup
- [ ] **Test**: Docker socket permissions guidance
- [ ] **Implement**: Linux-specific Docker guidance
- [ ] Manual test: Full install flow on Linux

---

## Phase 3: Polish

### 3.1 Update Command (AC-28, AC-29)

- [ ] **Test**: update command checks GitHub for latest version
- [ ] **Implement**: Version comparison logic
- [ ] **Test**: update command downloads and replaces CLI
- [ ] **Implement**: Self-update mechanism [AC-28]
- [ ] **Test**: update preserves config.json
- [ ] **Implement**: Config preservation [AC-29]

### 3.2 Help and UX (AC-30, AC-31)

- [ ] **Test**: base command shows help with all commands
- [ ] **Implement**: Comprehensive help text [AC-30]
- [ ] **Test**: each subcommand supports --help
- [ ] **Implement**: Subcommand help text [AC-31]
- [ ] Polish: Consistent output formatting across all commands
- [ ] Polish: Error messages are clear and actionable

### 3.3 Config Commands

- [ ] **Implement**: `config show` (redacted secrets)
- [ ] **Implement**: `config path` (show config location)
- [ ] **Implement**: `config reset` (with confirmation)

### 3.4 Release Automation

- [ ] Create GitHub Actions workflow for releases
- [ ] Build tarball with cli/ directory
- [ ] Upload to GitHub Releases on tag push
- [ ] Update install.sh to use releases URL

---

## Verification

All must pass before shipping.

- [ ] All unit tests passing
- [ ] Manual test: Fresh install on Mac
- [ ] Manual test: Fresh install on Linux
- [ ] Manual test: Setup wizard with valid keys
- [ ] Manual test: Setup wizard with invalid keys (error handling)
- [ ] Manual test: start/stop/status cycle
- [ ] Manual test: doctor with all services running
- [ ] Manual test: doctor with missing services
- [ ] Manual test: device add/list/remove cycle
- [ ] No linter errors (`npm run lint`)
- [ ] All 31 acceptance criteria from SPEC verified
- [ ] No secrets in committed code
- [ ] Config file permissions are 600

---

## Documentation

- [ ] Update README.md with installation instructions
- [ ] Update README.md with CLI command reference
- [ ] Update CLAUDE.md with CLI architecture
- [ ] Add CHANGELOG.md entry

---

## Ready for Ship

- [ ] Self-review complete
- [ ] All phases implemented
- [ ] Manual testing complete on Mac and Linux
- [ ] Documentation updated
- [ ] GitHub Release created
- [ ] Install URL tested end-to-end

---

## Notes

*Implementation notes will be added during build*

---

## Acceptance Criteria Mapping

| AC | Description | Task Section |
|----|-------------|--------------|
| AC-1 | curl install works | 1.9 Install Script |
| AC-2 | OS detection | 1.9, 2.4 |
| AC-3 | Docker check | 1.9 |
| AC-4 | Claude CLI check | 1.9 |
| AC-5 | PATH setup | 1.9 |
| AC-6 | Setup wizard launches | 1.3 |
| AC-7 | ElevenLabs validation | 1.3 |
| AC-8 | OpenAI validation | 1.3 |
| AC-9 | 3CX config prompts | 1.3 |
| AC-10 | Device setup prompts | 1.3 |
| AC-11 | Secure config save | 1.3 |
| AC-12 | Reconfigure support | 1.3 |
| AC-13 | Doctor runs checks | 2.1 |
| AC-14 | ElevenLabs health | 2.1 |
| AC-15 | OpenAI health | 2.1 |
| AC-16 | Claude CLI health | 2.1 |
| AC-17 | Docker health | 2.1 |
| AC-18 | Actionable errors | 2.1 |
| AC-19 | Start all services | 1.6 |
| AC-20 | Start status display | 1.6 |
| AC-21 | Stop all services | 1.7 |
| AC-22 | Status display | 1.8 |
| AC-23 | Logs command | 2.3 |
| AC-24 | Device add wizard | 2.2 |
| AC-25 | Device add fields | 2.2 |
| AC-26 | Device list | 2.2 |
| AC-27 | Device remove | 2.2 |
| AC-28 | Update command | 3.1 |
| AC-29 | Update preserves config | 3.1 |
| AC-30 | Base help | 3.2 |
| AC-31 | Subcommand help | 3.2 |
