#!/usr/bin/env bash
# caddy-update.sh: safely switch the live Caddy config to tools/server/Caddyfile.template.
# Run on the server as root:   bash /srv/tenshi/app/tools/server/caddy-update.sh
#   0. if the Tenshi Editor has no login yet (/etc/caddy/tenshi-editor.auth), asks for a user name and password and
#      stores only a bcrypt hash (tools/server/editor-password.sh). Add --editor-password to change an existing one.
#   1. builds the new Caddyfile from the template (in a temp file)
#   2. shows what changes compared with /etc/caddy/Caddyfile and asks before going on (add --yes to skip the question)
#   3. backs up the current file to /etc/caddy/Caddyfile.bak-<date-time>
#   4. checks the new file with `caddy validate`; stops without touching anything if it fails
#   5. installs it and reloads Caddy (no restart, no downtime)
#   6. checks the site still answers and the editor asks for its password; if not, puts the backup back and reloads again
# Options: --yes (don't ask before applying), --editor-password (set a new editor login first).
set -euo pipefail
YES=0; NEWPW=0
for a in "$@"; do case "$a" in --yes) YES=1;; --editor-password) NEWPW=1;; *) echo "Unknown option $a"; exit 1;; esac; done
DOMAIN=${DOMAIN:-tenshisystems.com}
APP=${APP:-/srv/tenshi/app}
LIVE=/etc/caddy/Caddyfile
TEMPLATE="$APP/tools/server/Caddyfile.template"
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f "$TEMPLATE" ] || { echo "Missing $TEMPLATE (run /usr/local/bin/tenshi-deploy first)."; exit 1; }

AUTH=/etc/caddy/tenshi-editor.auth
if [ ! -s "$AUTH" ] || [ "$NEWPW" = 1 ]; then
  echo "== Tenshi Editor login (admin.html will ask for this before it loads)"
  bash "$APP/tools/server/editor-password.sh"
fi

NEW=$(mktemp /tmp/Caddyfile.new.XXXXXX)
trap 'rm -f "$NEW"' EXIT
sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP__#$APP#g" "$TEMPLATE" > "$NEW"
# Caddy before 2.8 spells the directive "basicauth".
minor=$(caddy version | sed -nE 's/^v2\.([0-9]+).*/\1/p')
if [ -n "$minor" ] && [ "$minor" -lt 8 ]; then sed -i 's/\bbasic_auth\b/basicauth/' "$NEW"; fi

echo "== Changes (- live, + new):"
if diff -u "$LIVE" "$NEW"; then
  echo "Nothing to change in the Caddyfile."
  [ "$NEWPW" = 1 ] && { systemctl reload caddy && echo "== Reloaded Caddy: the new editor password is active."; }
  exit 0
fi
if [ "$YES" != 1 ]; then
  read -r -p "Apply these changes? [y/N] " ok
  [ "$ok" = y ] || [ "$ok" = Y ] || { echo "Stopped, nothing changed."; exit 0; }
fi

echo "== Checking the new config"
caddy validate --config "$NEW" --adapter caddyfile

BAK="$LIVE.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$LIVE" "$BAK"
echo "== Backup: $BAK"
install -m 644 "$NEW" "$LIVE"
echo "== Reloading Caddy"
if ! systemctl reload caddy; then
  echo "Reload failed: restoring the backup."; cp -p "$BAK" "$LIVE"; systemctl reload caddy; exit 1
fi
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)
redir=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/" || true)
admin=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/admin.html" || true)
if [ "$code" != 200 ] || [ "$admin" != 401 ]; then
  echo "After the reload the site answered $code (want 200) and the editor $admin (want 401): restoring the backup."
  cp -p "$BAK" "$LIVE"; systemctl reload caddy; exit 1
fi
echo "== Editor: https://$DOMAIN/admin.html now asks for the login (401 without it)"
echo "== OK: https://$DOMAIN/ -> $code, http:// -> $redir (redirect to https)"
curl -s -D - -o /dev/null --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/styles.css?v=check" | grep -iE '^(cache-control|strict-transport|permissions-policy|x-frame|content-security|alt-svc)' || true
curl -s -D - -o /dev/null --resolve "cms.$DOMAIN:443:127.0.0.1" "https://cms.$DOMAIN/login" | grep -iE '^(strict-transport|x-frame|x-content-type|permissions-policy)' || true
echo "(No alt-svc line above means HTTP/3 is off.)"
echo "To undo:  cp -p $BAK $LIVE && systemctl reload caddy"
