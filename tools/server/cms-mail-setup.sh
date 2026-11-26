#!/usr/bin/env bash
# cms-mail-setup.sh: let the CMS email new form messages (leads) to each form's recipient, using the same SMTP
# mailbox as the website's contact form. Run on the server as root:   bash /srv/tenshi/app/tools/server/cms-mail-setup.sh
#   1. reads SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and CONTACT_FROM from /etc/tenshi-contact.env
#      (or asks for them if that file has no SMTP login yet; the password is read without echo)
#   2. backs up /etc/tenshi-cms.env to /etc/tenshi-cms.env.bak-<date-time>
#   3. writes those lines into /etc/tenshi-cms.env (replacing old ones; nothing else changes), mode 600
#   4. restarts tenshi-cms and checks it answers; if not, puts the backup back and restarts again
# Nothing secret is printed. Undo: copy the .bak file back and run: systemctl restart tenshi-cms
set -euo pipefail
CMS_ENV=/etc/tenshi-cms.env
CONTACT_ENV=/etc/tenshi-contact.env
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f "$CMS_ENV" ] || { echo "Missing $CMS_ENV (is the CMS installed? tools/server/setup.sh)"; exit 1; }

get() { [ -f "$CONTACT_ENV" ] && sed -nE "s/^$1=(.*)$/\1/p" "$CONTACT_ENV" | tail -1 || true; }
SMTP_HOST=$(get SMTP_HOST); SMTP_PORT=$(get SMTP_PORT); SMTP_USER=$(get SMTP_USER); SMTP_PASS=$(get SMTP_PASS); CONTACT_FROM=$(get CONTACT_FROM)
if [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
  echo "No SMTP login in $CONTACT_ENV. Enter the mailbox that should send lead emails (e.g. leads@yourdomain)."
  read -rp "SMTP host [${SMTP_HOST:-smtp.hostinger.com}]: " x; SMTP_HOST=${x:-${SMTP_HOST:-smtp.hostinger.com}}
  read -rp "SMTP port (465 SSL or 587 STARTTLS) [${SMTP_PORT:-465}]: " x; SMTP_PORT=${x:-${SMTP_PORT:-465}}
  read -rp "Mailbox login (email address): " SMTP_USER
  read -rsp "Mailbox password: " SMTP_PASS; echo
  read -rp "From address [${SMTP_USER}]: " CONTACT_FROM
fi
SMTP_HOST=${SMTP_HOST:-smtp.hostinger.com}; SMTP_PORT=${SMTP_PORT:-465}
[ -n "$SMTP_USER" ] && [ -n "$SMTP_PASS" ] || { echo "No SMTP login given: nothing changed."; exit 1; }

BAK="$CMS_ENV.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$CMS_ENV" "$BAK"
NEW=$(mktemp /tmp/tenshi-cms.env.XXXXXX)
trap 'rm -f "$NEW"' EXIT
grep -vE '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|CONTACT_FROM)=' "$CMS_ENV" > "$NEW" || true
{
  echo "# Lead emails from the CMS (cms/mail.py), added by tools/server/cms-mail-setup.sh"
  echo "SMTP_HOST=$SMTP_HOST"; echo "SMTP_PORT=$SMTP_PORT"; echo "SMTP_USER=$SMTP_USER"; echo "SMTP_PASS=$SMTP_PASS"
  [ -n "$CONTACT_FROM" ] && echo "CONTACT_FROM=$CONTACT_FROM"
} >> "$NEW"
install -m 600 -o root -g root "$NEW" "$CMS_ENV"
echo "== Saved the mail settings in $CMS_ENV (backup: $BAK). Restarting the CMS…"
systemctl restart tenshi-cms
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/login || true)
  [ "$code" = 200 ] && { echo "== Done: the CMS is back up and emails new leads to each form's recipient."; exit 0; }
  sleep 1
done
echo "!! The CMS didn't come back; restoring the backup."
cp -p "$BAK" "$CMS_ENV"; systemctl restart tenshi-cms
exit 1
