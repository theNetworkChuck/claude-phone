# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] - 2026-02-17

### Added
- Codex backend support in `claude-api-server` and CLI backend selection.
- ChatGPT backend support (`chatgpt`) in `claude-api-server` using OpenAI Responses API.
- Optional ChatGPT model override support via `CHATGPT_MODEL` (fallback: `OPENAI_MODEL`, default: `gpt-5-mini`).
- Backend-aware setup/doctor/start handling for `claude`, `codex`, and `chatgpt`.
- `CLAUDE_PHONE_CONFIG_DIR` override support for isolated CLI config/testing.

### Changed
- API server and CLI documentation updated for multi-backend operation (Claude/Codex/ChatGPT).
- Project docs wording updated to use backend-agnostic assistant language where appropriate.

### Fixed
- Debian/Raspberry Pi Docker auto-install path in CLI setup:
  - Correct Docker apt repository target selection (`debian` vs `ubuntu`).
  - Fixed privileged write of `/etc/apt/sources.list.d/docker.list` (removed piped sudo write failure).
- Start command backend CLI check bug (`isClaudeInstalled is not defined`).

