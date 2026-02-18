# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Codex backend support in `claude-api-server` and CLI backend selection.
- OpenAI backend support (`openai`) in `claude-api-server` using OpenAI Responses API.
- Optional OpenAI model override support via `OPENAI_MODEL` (default: `gpt-5-mini`).
- OpenAI Responses web search tool support for `openai` backend with env-based controls (`OPENAI_WEB_SEARCH_*`).
- Backend-aware setup/doctor/start handling for `claude`, `codex`, and `openai`.
- `CLAUDE_PHONE_CONFIG_DIR` override support for isolated CLI config/testing.

### Changed
- API server and CLI documentation updated for multi-backend operation (Claude/Codex/OpenAI).
- Project docs wording updated to use backend-agnostic assistant language where appropriate.
- `/health` now exposes OpenAI backend details when applicable (`model`, `webSearchEnabled`, `webSearchType`).

### Fixed
- Debian/Raspberry Pi Docker auto-install path in CLI setup:
  - Correct Docker apt repository target selection (`debian` vs `ubuntu`).
  - Fixed privileged write of `/etc/apt/sources.list.d/docker.list` (removed piped sudo write failure).
- Start command backend CLI check bug (`isClaudeInstalled is not defined`).
- OpenAI backend now retries once without web search if the configured web-search tool type is unsupported.
