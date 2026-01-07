#!/bin/bash
set -e

# Claude Phone CLI Installer
# Usage: curl -sSL https://raw.githubusercontent.com/.../install.sh | bash

INSTALL_DIR="$HOME/.claude-phone-cli"
BIN_DIR="/usr/local/bin"
REPO_URL="https://github.com/networkchuck/claude-phone.git"

echo "🎯 Claude Phone CLI Installer"
echo ""

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin*)
    echo "✓ Detected macOS"
    ;;
  Linux*)
    echo "⚠️  Linux detected - this installer is designed for macOS"
    echo "   You may need to manually adjust the installation"
    ;;
  *)
    echo "✗ Unsupported OS: $OS"
    echo "   This installer only supports macOS"
    exit 1
    ;;
esac

# Check Docker
echo ""
echo "Checking dependencies..."
if ! command -v docker &> /dev/null; then
  echo "✗ Docker not found"
  echo "  Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
  exit 1
fi
echo "✓ Docker installed"

# Check Claude CLI
if ! command -v claude &> /dev/null; then
  echo "⚠️  Claude CLI not found"
  echo "  Install from: https://claude.com/download"
  echo "  You'll need Claude Max subscription for the API server"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "✓ Claude CLI installed"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found"
  echo "  Install from: https://nodejs.org/"
  exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "✗ Node.js version 18+ required (found v$NODE_VERSION)"
  echo "  Install latest from: https://nodejs.org/"
  exit 1
fi
echo "✓ Node.js $(node -v) installed"

# Clone or update repository
echo ""
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  echo "Installing Claude Phone CLI..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install CLI dependencies
echo ""
echo "Installing CLI dependencies..."
cd "$INSTALL_DIR/cli"
npm install --silent --production

# Create symlink
echo ""
if [ -L "$BIN_DIR/claude-phone" ]; then
  echo "Updating symlink..."
  rm "$BIN_DIR/claude-phone"
fi

if [ -w "$BIN_DIR" ]; then
  ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  echo "✓ Symlink created: $BIN_DIR/claude-phone"
else
  echo "Creating symlink (requires sudo)..."
  sudo ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  echo "✓ Symlink created: $BIN_DIR/claude-phone"
fi

# Success
echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'claude-phone setup' to configure your installation"
echo "  2. Run 'claude-phone start' to launch services"
echo "  3. Call your extension and start talking to Claude!"
echo ""
