# Raspberry Pi Deployment Implementation Plan

> HOW to build what the spec defined. Technical decisions and architecture.

**Spec:** [SPEC.md](./SPEC.md)
**Status:** DRAFT

---

## Technical Approach

### Architecture Decision

Extend the existing CLI with **platform detection** and **conditional setup flows**. Rather than creating a separate Pi-specific installer, we enhance `claude-phone setup` to detect the platform and branch into the appropriate configuration path.

```
┌─────────────────────────────────────────────────────────────────┐
│  claude-phone setup                                              │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────┐                                            │
│  │ Platform Detect │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│     ┌─────┴─────┐                                               │
│     │           │                                                │
│     ▼           ▼                                                │
│  [Mac/Linux]  [Pi arm64]                                        │
│     │           │                                                │
│     ▼           ▼                                                │
│  Standard    Pi Setup                                           │
│  Setup       Flow                                               │
│     │           │                                                │
│     │           ├── Check Docker prerequisite                   │
│     │           ├── Detect 3CX SBC (port 5060)                  │
│     │           ├── Ask for Mac IP                              │
│     │           ├── Configure drachtio port (5060 or 5070)      │
│     │           └── Generate split-architecture config           │
│     │                                                            │
│     ▼           ▼                                                │
│  Local       Remote                                             │
│  Config      Config                                             │
│  (all-in-one) (pi + mac)                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Technical Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform detection | `os.arch()` + `/proc/device-tree/model` | arm64 + Pi model string = definitive Pi detection |
| 3CX SBC detection | `net.connect()` to port 5060 | Non-invasive check if port is already bound |
| Docker check | `which docker && docker compose version` | Standard availability check |
| Config schema | Extend existing with `deployment.mode` field | Backward compatible, single config format |
| Mac command | New `api-server` subcommand | Fits existing commander.js pattern |

---

## Dependencies

### External

- **os** (Node builtin) - Platform and architecture detection
- **net** (Node builtin) - Port availability checking
- **child_process** (Node builtin) - Docker/command execution
- No new npm dependencies required

### Internal

- `lib/config.js` - Extended for Pi-specific fields
- `lib/validators.js` - New validators for IP reachability
- `lib/commands/setup.js` - Platform branching logic
- `lib/docker.js` - Pi-specific compose generation

### Blockers

- [x] Research confirms 3CX SBC coexistence is possible
- [ ] ARM64 Docker images verified on actual Pi hardware (testing phase)

---

## Data Model

### Config Schema Extension

```javascript
// Extended config structure for Pi deployment
{
  version: '1.1.0',  // Bump version for new schema

  // NEW: Deployment mode
  deployment: {
    mode: 'standard' | 'pi-split',  // 'standard' = all-in-one, 'pi-split' = Pi + Mac
    platform: 'darwin' | 'linux-x64' | 'linux-arm64',
    piDetected: boolean,

    // Pi-specific (only when mode === 'pi-split')
    pi: {
      sbcDetected: boolean,      // 3CX SBC found on port 5060
      drachtioPPort: 5060 | 5070, // 5070 if SBC detected
      macApiUrl: string          // e.g., 'http://192.168.1.100:3333'
    }
  },

  // Existing fields unchanged
  api: { ... },
  sip: { ... },
  server: { ... },
  secrets: { ... },
  devices: [ ... ],
  paths: { ... }
}
```

### Types

```typescript
// Platform detection result
interface PlatformInfo {
  os: 'darwin' | 'linux' | 'win32';
  arch: 'x64' | 'arm64' | 'arm';
  isPi: boolean;
  piModel?: string;  // e.g., 'Raspberry Pi 4 Model B Rev 1.4'
}

// Prerequisite check result
interface PrerequisiteResult {
  name: string;
  installed: boolean;
  version?: string;
  error?: string;
  installUrl?: string;
}

// Port check result
interface PortCheckResult {
  port: number;
  inUse: boolean;
  process?: string;  // What's using it, if detectable
}
```

---

## API / Interface

### New CLI Commands

```bash
# Mac-side: Start claude-api-server
claude-phone api-server [--port 3333]

# Enhanced status (shows Pi ↔ Mac connectivity)
claude-phone status

# Enhanced doctor (validates Pi ↔ Mac connectivity)
claude-phone doctor
```

### New Module: Platform Detection

```javascript
// lib/platform.js

/**
 * Detect current platform and Pi status
 * @returns {Promise<PlatformInfo>}
 */
export async function detectPlatform();

/**
 * Check if running on Raspberry Pi
 * @returns {Promise<boolean>}
 */
export async function isRaspberryPi();

/**
 * Get Pi model string if available
 * @returns {Promise<string|null>}
 */
export async function getPiModel();
```

### New Module: Prerequisites

```javascript
// lib/prerequisites.js

/**
 * Check if Docker is installed and accessible
 * @returns {Promise<PrerequisiteResult>}
 */
export async function checkDocker();

/**
 * Check if docker-compose/docker compose is available
 * @returns {Promise<PrerequisiteResult>}
 */
export async function checkDockerCompose();

/**
 * Check all prerequisites for Pi deployment
 * @returns {Promise<PrerequisiteResult[]>}
 */
export async function checkPiPrerequisites();
```

### New Module: Port Detection

```javascript
// lib/port-check.js

/**
 * Check if a port is in use
 * @param {number} port
 * @returns {Promise<PortCheckResult>}
 */
export async function checkPort(port);

/**
 * Detect if 3CX SBC is running (port 5060)
 * @returns {Promise<boolean>}
 */
export async function detect3cxSbc();
```

### New Module: Network Validation

```javascript
// lib/network.js

/**
 * Check if an IP is reachable on the network
 * @param {string} ip
 * @param {number} [timeout=3000]
 * @returns {Promise<boolean>}
 */
export async function isReachable(ip, timeout);

/**
 * Check if claude-api-server is responding
 * @param {string} url - e.g., 'http://192.168.1.100:3333'
 * @returns {Promise<{reachable: boolean, healthy: boolean}>}
 */
export async function checkClaudeApiServer(url);
```

### New Command: api-server

```javascript
// lib/commands/api-server.js

/**
 * Start claude-api-server on Mac
 * @param {object} options
 * @param {number} [options.port=3333]
 */
export async function apiServerCommand(options);
```

---

## File Structure

New and modified files:

```
cli/
├── bin/
│   └── claude-phone.js        # Add api-server command
├── lib/
│   ├── platform.js            # NEW: Platform detection
│   ├── prerequisites.js       # NEW: Docker checks
│   ├── port-check.js          # NEW: Port availability
│   ├── network.js             # NEW: IP/URL validation
│   ├── config.js              # MODIFY: Add deployment schema
│   ├── docker.js              # MODIFY: Pi-specific compose
│   └── commands/
│       ├── setup.js           # MODIFY: Platform branching
│       ├── status.js          # MODIFY: Remote API status
│       ├── doctor.js          # MODIFY: Pi connectivity
│       └── api-server.js      # NEW: Mac API server command
└── test/
    ├── platform.test.js       # NEW
    ├── prerequisites.test.js  # NEW
    ├── port-check.test.js     # NEW
    └── network.test.js        # NEW
```

---

## Test Strategy

### Unit Tests

Test core logic in isolation.

- [ ] `platform.js` - Mock `/proc/device-tree/model` for Pi detection
- [ ] `prerequisites.js` - Mock `child_process.exec` for Docker checks
- [ ] `port-check.js` - Mock `net.connect` for port detection
- [ ] `network.js` - Mock HTTP requests for reachability
- [ ] Config schema validation - New deployment fields

### Integration Tests

Test components working together.

- [ ] Setup flow branching - Pi detected → Pi setup path
- [ ] Setup flow branching - Mac detected → Standard setup path
- [ ] SBC detection → Port 5070 configuration
- [ ] No SBC → Port 5060 configuration
- [ ] `api-server` command starts server correctly

### What NOT to Test

- Actual Docker container behavior (covered by e2e)
- Actual Pi hardware detection (manual testing)
- 3CX SBC interaction (manual testing)

### Manual Testing Checklist

- [ ] Run `claude-phone setup` on actual Pi 4/5
- [ ] Verify 3CX SBC detection when SBC is running
- [ ] Verify drachtio starts on port 5070 with SBC
- [ ] Verify drachtio starts on port 5060 without SBC
- [ ] Test `claude-phone api-server` on Mac
- [ ] Test full call flow: Pi → Mac → Claude → response

---

## Implementation Notes

### Gotchas

1. **Pi detection via /proc/device-tree/model** - File may not exist on non-Pi Linux. Use try/catch.
2. **Port 5060 check timing** - 3CX SBC may not be running during setup. Warn user if port appears free but they claim SBC is installed.
3. **Docker socket permissions** - On Pi, user may need to be in `docker` group. Check and advise.
4. **IP validation** - Mac IP could change. Suggest static IP or hostname if available.

### Performance Considerations

- Port checks should timeout quickly (1 second max)
- IP reachability checks should timeout in 3 seconds
- Platform detection is synchronous file read, very fast

### Security Considerations

- Mac IP stored in Pi config - LAN-only, acceptable risk
- `api-server` binds to 0.0.0.0 by default - warn user about firewall
- Consider optional `--bind` flag for api-server to restrict interface

---

## Migration Path

For users with existing `standard` deployments who want to switch to `pi-split`:

1. Run `claude-phone setup` on Pi
2. Detect existing config → offer migration prompt
3. Extract relevant fields (API keys, devices) to Pi config
4. Generate Mac-only config for api-server
5. Guide user through both-device setup

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Morpheus | 2026-01-12 | |
| Tech Reviewer | Chuck | | Pending |

**Approved for Implementation:** [ ] Yes
