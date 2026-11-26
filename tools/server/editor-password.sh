#!/usr/bin/env bash
# editor-password.sh: set the user name and password that protect the Tenshi Editor (admin.html and admin/).
# Run on the server as root:   bash /srv/tenshi/app/tools/server/editor-password.sh
# Caddy asks for this login before it serves the editor (basic_auth in Caddyfile.template). Only a bcrypt hash made by
# `caddy hash-password` is stored, in /etc/caddy/tenshi-editor.auth (root:caddy, mode 640). The password itself is never
# written to disk, never put on a command line, and never stored in the repository.
# After changing it on a running server, reload Caddy:  systemctl reload caddy   (caddy-update.sh does this for you).
set -euo pipefail
AUTH=${EDITOR_AUTH_FILE:-/etc/caddy/tenshi-editor.auth}
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
command -v caddy >/dev/null || { echo "Caddy isn't installed."; exit 1; }

if [ ! -t 0 ]; then
  # No keyboard (e.g. setup.sh piped from curl): make a strong random password and show it once.
  user=${EDITOR_USER:-tenshi}
  pw=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-24)
  echo "No terminal to ask for a password, so one was made for the Tenshi Editor:"
  echo "    user: $user    password: $pw"
  echo "Write it down now: it is not saved anywhere. Change it later with: bash $0"
else
  read -r -p "Editor user name [tenshi]: " user
  user=${user:-tenshi}
  while true; do
    read -r -s -p "Editor password (12+ characters): " pw; echo
    read -r -s -p "Same password again: " pw2; echo
    if [ "$pw" != "$pw2" ]; then echo "They don't match, try again."; continue; fi
    if [ ${#pw} -lt 12 ]; then echo "Use at least 12 characters."; continue; fi
    break
  done
  unset pw2
fi
case "$user" in *[!A-Za-z0-9._@-]*|"") echo "User names can use letters, numbers and . _ @ - only."; exit 1;; esac

hash=$(printf '%s\n' "$pw" | caddy hash-password)
unset pw
case "$hash" in '$2'*) ;; *) echo "caddy hash-password didn't return a bcrypt hash; nothing changed."; exit 1;; esac

mkdir -p "$(dirname "$AUTH")"
tmp=$(mktemp "$AUTH.XXXXXX")
printf '%s %s\n' "$user" "$hash" > "$tmp"
chmod 640 "$tmp"
if getent group caddy >/dev/null; then chown root:caddy "$tmp"; fi
[ -f "$AUTH" ] && cp -p "$AUTH" "$AUTH.bak"
mv "$tmp" "$AUTH"
echo "== Editor login saved for user '$user' in $AUTH (bcrypt hash only)."
