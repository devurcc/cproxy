#!/usr/bin/env sh
# install.sh - Installs cproxy
# Usage: curl -fsSL https://raw.githubusercontent.com/devurcc/cproxy/master/install.sh | sh

set -eu

# Цветной вывод
RED='\033[0;31m'
GREEN='\033[0;32m'
RESET='\033[0m'

info() { echo "${GREEN}$1${RESET}"; }
error() { echo "${RED}ERROR: $1${RESET}" >&2; exit 1; }

# Определение OS и архитектуры
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    *)      error "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
    x86_64|amd64)  ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)             error "Unsupported architecture: $ARCH" ;;
esac

BINARY_NAME="cproxy-${OS}-${ARCH}"
RELEASES_URL="https://github.com/devurcc/cproxy/releases/latest/download/${BINARY_NAME}"

# Директория установки
BINDIR="${BINDIR:-/usr/local/bin}"
if [ ! -w "$BINDIR" ] && [ ! -d "$BINDIR" ]; then
    if [ -w "${HOME}/.local/bin" ] || mkdir -p "${HOME}/.local/bin" 2>/dev/null; then
        BINDIR="${HOME}/.local/bin"
    else
        error "Cannot write to /usr/local/bin or ${HOME}/.local/bin. Try: sudo BINDIR=/usr/local/bin curl -fsSL ... | sh"
    fi
fi

# Скачивание
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info "Downloading cproxy for ${OS}-${ARCH}..."
curl --fail --show-error --location --progress-bar "$RELEASES_URL" -o "$TMPDIR/cproxy" || \
    error "Failed to download cproxy. Check if release exists for ${OS}-${ARCH}"

chmod +x "$TMPDIR/cproxy"
mv "$TMPDIR/cproxy" "${BINDIR}/cproxy"

info "cproxy installed to ${BINDIR}/cproxy"
info "Run 'cproxy' to get started."