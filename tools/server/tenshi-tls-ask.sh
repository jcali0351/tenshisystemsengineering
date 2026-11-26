#!/usr/bin/env bash
# tenshi-tls-ask.sh: make Caddy ask the CMS before it gets an HTTPS certificate for a client-site name.
# Run on the server as root:   bash /srv/tenshi/app/tools/server/tenshi-tls-ask.sh
#
# Today Caddy's on_demand_tls asks the small tenshi-tls-ask service (127.0.0.1:9123), which says yes to ANY
# <one-word>.tenshisystems.com, real or not, and no to every custom domain. After this script it asks the CMS
# (GET http://127.0.0.1:8000/__tls/ask?domain=..., cms/domains.py), which says yes only for
#   - <subdomain>.tenshisystems.com of a site that exists, and
#   - a custom domain attached to a site that exists (Settings > Custom domains),
# so client sites can use their own domains over HTTPS and nobody can make the server request certificates for
# made-up names. Certificates Caddy already has keep working; only NEW names are asked about.
#
# What it does (like caddy-update.sh):
#   1. checks the CMS has the new endpoint (a made-up name gets "no"; a real site, if there is one, gets "yes");
#      stops without touching anything if not (deploy the CMS first)
#   2. builds the new Caddyfile from /etc/caddy/Caddyfile (in a temp file): the on_demand_tls ask line points at the
#      CMS (adds the on_demand_tls block to the global options if there is none)
#   3. shows the change and asks before going on (add --yes to skip the question)
#   4. checks the new file with `caddy validate`; stops without touching anything if it fails
#   5. backs up the current file to /etc/caddy/Caddyfile.bak-<date-time>, installs the new one, reloads Caddy
#      (no restart, no downtime)
#   6. checks the main site, the CMS and a client site still answer; if not, puts the backup back and reloads again
# Options:
#   --yes                don't ask before applying
#   --disable-old-guard  after a good switch, stop and disable the old tenshi-tls-ask service on :9123
#   --rollback           put back the newest Caddyfile.bak-* and reload (undo), then exit
# Also update tools/server/Caddyfile.template? Already done in git: its ask line points at the CMS too, so
# caddy-update.sh won't switch it back.
set -euo pipefail
YES=0; OLD=0; ROLLBACK=0
for a in "$@"; do case "$a" in --yes) YES=1;; --disable-old-guard) OLD=1;; --rollback) ROLLBACK=1;; *) echo "Unknown option $a"; exit 1;; esac; done
DOMAIN=${DOMAIN:-tenshisystems.com}
CMS=${CMS:-http://127.0.0.1:8000}
ASK="$CMS/__tls/ask"
LIVE=/etc/caddy/Caddyfile
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
command -v caddy >/dev/null || { echo "caddy isn't installed."; exit 1; }

if [ "$ROLLBACK" = 1 ]; then
  BAK=$(ls -1t "$LIVE".bak-* 2>/dev/null | head -n1 || true)
  [ -n "$BAK" ] || { echo "No $LIVE.bak-* to put back."; exit 1; }
  echo "== Putting back $BAK"
  caddy validate --config "$BAK" --adapter caddyfile
  cp -p "$BAK" "$LIVE" && systemctl reload caddy && echo "== Done: Caddy uses $BAK again."
  exit 0
fi

echo "== 1. Is the CMS ready to answer?"
probe=$(curl -s -D - -o /dev/null "$ASK?domain=no-such-site-$RANDOM$RANDOM.$DOMAIN" || true)
code=$(printf '%s' "$probe" | sed -nE '1s#^HTTP/[0-9.]+ ([0-9]{3}).*#\1#p')
if [ "$code" != 404 ] || ! printf '%s' "$probe" | grep -qi '^x-tenshi-ask: 1'; then
  echo "The CMS at $CMS doesn't have /__tls/ask yet (got HTTP ${code:-nothing}). Deploy the latest tenshi-cms first. Nothing changed."
  exit 1
fi
echo "   a made-up name -> 404 (good)"
# A real client site to check with (read-only look at the CMS database).
DATA=$(sed -nE 's/^TENSHI_DATA=(.*)$/\1/p' /etc/tenshi-cms.env 2>/dev/null | tail -n1)
DATA=${DATA:-/srv/tenshi/data}
SUB=""
if [ -f "$DATA/tenshi.db" ]; then
  SUB=$(python3 - "$DATA/tenshi.db" <<'PY' 2>/dev/null || true
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
r = c.execute("SELECT subdomain FROM sites WHERE current_build_id IS NOT NULL AND status = 'live' ORDER BY id LIMIT 1").fetchone()
print(r[0] if r else "")
PY
)
fi
if [ -n "$SUB" ]; then
  yes=$(curl -s -o /dev/null -w '%{http_code}' "$ASK?domain=$SUB.$DOMAIN" || true)
  [ "$yes" = 200 ] || { echo "The CMS said $yes (want 200) for the real site $SUB.$DOMAIN. Nothing changed."; exit 1; }
  echo "   $SUB.$DOMAIN -> 200 (good)"
else
  echo "   (no live client site found to check a yes with; going on)"
fi

echo "== 2. Building the new Caddyfile"
NEW=$(mktemp /tmp/Caddyfile.new.XXXXXX)
trap 'rm -f "$NEW"' EXIT
python3 - "$LIVE" "$NEW" "$ASK" <<'PY'
import re, sys
live, new, ask = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(live).read()
line = f"ask {ask}"
if re.search(r"^\s*on_demand_tls\s*\{", text, re.M):
    block = re.search(r"(^\s*on_demand_tls\s*\{)(.*?)(^\s*\})", text, re.M | re.S)
    body = block.group(2)
    if re.search(r"^\s*ask\s+\S+", body, re.M):
        body = re.sub(r"^(\s*)ask\s+\S+", lambda m: m.group(1) + line, body, count=1, flags=re.M)
    else:
        body = "\n\t\t" + line + body
    text = text[:block.start(2)] + body + text[block.end(2):]
elif re.match(r"\s*(#[^\n]*\n\s*)*\{", text):          # a global options block exists: add on_demand_tls to it
    m = re.match(r"(\s*(?:#[^\n]*\n\s*)*\{)", text)
    text = text[:m.end()] + f"\n\ton_demand_tls {{\n\t\t{line}\n\t}}" + text[m.end():]
else:
    text = f"{{\n\ton_demand_tls {{\n\t\t{line}\n\t}}\n}}\n\n" + text
open(new, "w").write(text)
PY
grep -q "ask $ASK" "$NEW" || { echo "Couldn't place the ask line. Nothing changed."; exit 1; }

echo "== 3. Changes (- live, + new):"
if diff -u "$LIVE" "$NEW"; then
  echo "Caddy already asks the CMS. Nothing to change."
else
  if [ "$YES" != 1 ]; then
    read -r -p "Apply this change? [y/N] " ok
    [ "$ok" = y ] || [ "$ok" = Y ] || { echo "Stopped, nothing changed."; exit 0; }
  fi
  echo "== 4. Checking the new config"
  caddy validate --config "$NEW" --adapter caddyfile

  echo "== 5. Backup and reload"
  BAK="$LIVE.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$LIVE" "$BAK"
  echo "   backup: $BAK"
  install -m 644 "$NEW" "$LIVE"
  if ! systemctl reload caddy; then
    echo "Reload failed: restoring the backup."; cp -p "$BAK" "$LIVE"; systemctl reload caddy; exit 1
  fi
  sleep 2

  echo "== 6. Checking everything still answers"
  main=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)
  cms=$(curl -s -o /dev/null -w '%{http_code}' --resolve "cms.$DOMAIN:443:127.0.0.1" "https://cms.$DOMAIN/login" || true)
  client=skip
  [ -n "$SUB" ] && client=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$SUB.$DOMAIN:443:127.0.0.1" "https://$SUB.$DOMAIN/" || true)
  if [ "$main" != 200 ] || [ "$cms" != 200 ] || { [ "$client" != skip ] && [ "$client" != 200 ]; }; then
    echo "After the reload: main site $main, CMS $cms, client site $client (want 200 each): restoring the backup."
    cp -p "$BAK" "$LIVE"; systemctl reload caddy; exit 1
  fi
  echo "   main site $main, CMS $cms, client site ${SUB:+$SUB.$DOMAIN }$client"
  echo "   To undo:  bash $0 --rollback    (or: cp -p $BAK $LIVE && systemctl reload caddy)"
fi

if [ "$OLD" = 1 ] && systemctl list-unit-files tenshi-tls-ask.service >/dev/null 2>&1; then
  if grep -q "ask $ASK" "$LIVE"; then
    systemctl disable --now tenshi-tls-ask.service && echo "== Old guard on :9123 stopped and disabled (systemctl enable --now tenshi-tls-ask to bring it back)."
  fi
fi
echo "== OK: Caddy asks $ASK before each new certificate."
echo "   A custom domain gets HTTPS on its first visit once (a) it's added under the site's Settings > Custom domains and"
echo "   (b) its DNS points at this server."
