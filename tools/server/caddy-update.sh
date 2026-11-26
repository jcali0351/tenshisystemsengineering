#!/usr/bin/env bash
# caddy-update.sh: safely switch the live Caddy config to tools/server/Caddyfile.template.
# Run on the server as root:   bash /srv/tenshi/app/tools/server/caddy-update.sh
#   1. builds the new Caddyfile from the template (in a temp file)
#   2. shows what changes compared with /etc/caddy/Caddyfile and asks before going on (add --yes to skip the question)
#   3. backs up the current file to /etc/caddy/Caddyfile.bak-<date-time>
#   4. checks the new file with `caddy validate`; stops without touching anything if it fails
#   5. installs it and reloads Caddy (no restart, no downtime)
#   6. checks the site still answers; if not, puts the backup back and reloads again
set -euo pipefail
DOMAIN=${DOMAIN:-tenshisystems.com}
APP=${APP:-/srv/tenshi/app}
LIVE=/etc/caddy/Caddyfile
TEMPLATE="$APP/tools/server/Caddyfile.template"
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f "$TEMPLATE" ] || { echo "Missing $TEMPLATE (run /usr/local/bin/tenshi-deploy first)."; exit 1; }

NEW=$(mktemp /tmp/Caddyfile.new.XXXXXX)
trap 'rm -f "$NEW"' EXIT
sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP__#$APP#g" "$TEMPLATE" > "$NEW"

echo "== Changes (- live, + new):"
if diff -u "$LIVE" "$NEW"; then echo "Nothing to change."; exit 0; fi
if [ "${1:-}" != "--yes" ]; then
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
if [ "$code" != 200 ]; then
  echo "Site answered $code after the reload: restoring the backup."; cp -p "$BAK" "$LIVE"; systemctl reload caddy; exit 1
fi
echo "== OK: https://$DOMAIN/ -> $code, http:// -> $redir (redirect to https)"
curl -s -D - -o /dev/null --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/styles.css?v=check" | grep -iE '^(cache-control|strict-transport|permissions-policy|x-frame|content-security)' || true
echo "To undo:  cp -p $BAK $LIVE && systemctl reload caddy"
