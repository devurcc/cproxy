#!/usr/bin/env sh
# install.sh - Installs cproxy
# Usage: curl -fsSL https://raw.githubusercontent.com/devurcc/cproxy/master/install.sh | sh

set -eu

# Цветной вывод
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RESET='\033[0m'

info() { echo "${GREEN}$1${RESET}"; }
warn() { echo "${YELLOW}$1${RESET}"; }
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

# Директория установки (по умолчанию ~/.local/bin)
BINDIR="${BINDIR:-${HOME}/.local/bin}"
mkdir -p "$BINDIR" || error "Cannot create $BINDIR"

# Скачивание
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info "Downloading cproxy for ${OS}-${ARCH}..."
curl --fail --show-error --location --progress-bar "$RELEASES_URL" -o "$TMPDIR/cproxy" || \
    error "Failed to download cproxy. Check if release exists for ${OS}-${ARCH}"

chmod +x "$TMPDIR/cproxy"
mv "$TMPDIR/cproxy" "${BINDIR}/cproxy"

info "cproxy installed to ${BINDIR}/cproxy"

# Проверка PATH
case ":${PATH}:" in
    *":${BINDIR}:"*)
        info "Run 'cproxy' to get started."
        ;;
    *)
        warn "${BINDIR} is not in PATH."
        # Определяем shell config файл
        SHELL_RC=""
        case "${SHELL:-}" in
            */zsh) SHELL_RC="${HOME}/.zshrc" ;;
            */bash) SHELL_RC="${HOME}/.bashrc" ;;
            *) SHELL_RC="${HOME}/.profile" ;;
        esac

        # Добавляем в PATH
        echo "" >> "$SHELL_RC"
        echo "# Added by cproxy installer" >> "$SHELL_RC"
        echo "export PATH=\"\${PATH}:${BINDIR}\"" >> "$SHELL_RC"
        info "Added ${BINDIR} to PATH in ${SHELL_RC}"
        info "Run 'source ${SHELL_RC}' or start a new shell, then 'cproxy'"
        ;;
esac