#!/usr/bin/env bash
# Tenshi Systems server setup (Ubuntu 24.04). Safe to run again.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DOMAIN=tenshisystems.com
REPO=https://github.com/jcali0351/tenshisystemsengineering.git
BRANCH=tenshi-cms
APP=/srv/tenshi/app
DATA=/srv/tenshi/data

echo "== 1. Updates and packages"
apt-get update -qq
apt-get -y -qq upgrade
apt-get -y -qq install git python3-venv python3-pip ufw fail2ban unattended-upgrades sqlite3 debian-keyring debian-archive-keyring apt-transport-https curl gnupg
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get -y -qq install caddy
fi
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

echo "== 2. Firewall: only SSH and the web"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | head -12

echo "== 3. SSH: keys only (no password logins)"
cat > /etc/ssh/sshd_config.d/90-tenshi.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh || systemctl reload sshd || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true

echo "== 4. App user, code and data"
id tenshi >/dev/null 2>&1 || useradd --system --home /srv/tenshi --shell /usr/sbin/nologin tenshi
mkdir -p /srv/tenshi "$DATA"
if [ ! -d "$APP/.git" ]; then git clone --quiet --branch "$BRANCH" "$REPO" "$APP"; else git -C "$APP" fetch --quiet origin "$BRANCH" && git -C "$APP" reset --quiet --hard "origin/$BRANCH"; fi
chown -R tenshi:tenshi /srv/tenshi
chmod 750 "$DATA"
sudo -u tenshi python3 -m venv "$APP/platform/.venv"
sudo -u tenshi "$APP/platform/.venv/bin/pip" install -q --upgrade pip
sudo -u tenshi "$APP/platform/.venv/bin/pip" install -q -r "$APP/platform/requirements.txt"

echo "== 5. CMS settings"
cat > /etc/tenshi-cms.env <<EOF
TENSHI_DATA=$DATA
TENSHI_HOST=127.0.0.1
TENSHI_PORT=8000
TENSHI_SITES_DOMAIN=$DOMAIN
TENSHI_SITES_SCHEME=https
TENSHI_PUBLIC_URL=https://cms.$DOMAIN
TENSHI_LAUNCH_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://jcali0351.github.io
TENSHI_MAX_UPLOAD_MB=200
EOF
chmod 640 /etc/tenshi-cms.env; chown root:tenshi /etc/tenshi-cms.env

echo "== 6. First admin account (only if there is none yet): random password, root-only file"
if [ ! -f /root/tenshi-cms-admin.txt ]; then
  PW=$(python3 -c "import secrets,string; a=string.ascii_letters+string.digits; print(''.join(secrets.choice(a) for _ in range(20)))")
  ( set -a; . /etc/tenshi-cms.env; set +a; cd "$APP/platform"
    sudo -u tenshi --preserve-env=TENSHI_DATA "$APP/platform/.venv/bin/python" - "$PW" <<'PY'
import sys
from cms import config, db, auth
config.ensure_folders()
db.setup()
if auth.needs_setup():
    auth.create_user("admin@tenshisystems.com", "Admin", sys.argv[1], "admin")
    print("admin account created")
else:
    print("an admin account already exists; left it alone")
PY
  )
  ( umask 077; printf 'Tenshi CMS: https://cms.%s\nEmail: admin@tenshisystems.com\nPassword: %s\n(Change it after your first sign-in.)\n' "$DOMAIN" "$PW" > /root/tenshi-cms-admin.txt )   # strict permissions for this file only
  chmod 600 /root/tenshi-cms-admin.txt
fi

echo "== 7. CMS service (always on, restarts by itself)"
cat > /etc/systemd/system/tenshi-cms.service <<EOF
[Unit]
Description=Tenshi CMS
After=network.target

[Service]
User=tenshi
Group=tenshi
WorkingDirectory=$APP/platform
EnvironmentFile=/etc/tenshi-cms.env
ExecStart=$APP/platform/.venv/bin/python run_cms.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "== 8. Certificate guard for client sites: only real subdomains of $DOMAIN get HTTPS certificates"
cat > /usr/local/bin/tenshi-tls-ask <<'PY'
#!/usr/bin/env python3
# Caddy asks this before getting an HTTPS certificate for a client-site name. Yes only for <one-word>.tenshisystems.com.
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
OK = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.tenshisystems\.com$")
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        name = parse_qs(urlparse(self.path).query).get("domain", [""])[0].lower()
        self.send_response(200 if OK.match(name) else 403); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 9123), H).serve_forever()
PY
chmod 755 /usr/local/bin/tenshi-tls-ask
cat > /etc/systemd/system/tenshi-tls-ask.service <<'EOF'
[Unit]
Description=Tenshi TLS certificate guard
[Service]
ExecStart=/usr/local/bin/tenshi-tls-ask
Restart=always
DynamicUser=true
[Install]
WantedBy=multi-user.target
EOF

echo "== 9. Web server (Caddy): the website, the CMS and client sites, all on HTTPS"
cat > /etc/caddy/Caddyfile <<EOF
{
	on_demand_tls {
		ask http://127.0.0.1:9123/check
	}
}

$DOMAIN {
	root * $APP
	@private path /platform* /tools* /.git* /.github* /docs* /node_modules* /marketing* /src* /.claude* /package.json /package-lock.json /*.md /*.patch /.gitignore /*.mjs
	respond @private 404
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	@pages path / *.html
	header @pages Cache-Control "no-cache"
	file_server
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}

cms.$DOMAIN {
	encode zstd gzip
	request_body {
		max_size 210MB
	}
	reverse_proxy 127.0.0.1:8000
}

https:// {
	tls {
		on_demand
	}
	encode zstd gzip
	reverse_proxy 127.0.0.1:8000
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1

echo "== 10. Nightly backup of the CMS data (keeps 14 days)"
cat > /usr/local/bin/tenshi-backup <<'EOF'
#!/usr/bin/env bash
set -e
mkdir -p /var/backups/tenshi && chmod 700 /var/backups/tenshi
STAMP=$(date +%Y%m%d-%H%M)
sqlite3 /srv/tenshi/data/tenshi.db ".backup '/var/backups/tenshi/tenshi-$STAMP.db'"
tar -czf "/var/backups/tenshi/cms-data-$STAMP.tar.gz" --exclude='data/tenshi.db*' -C /srv/tenshi data
find /var/backups/tenshi -type f -mtime +14 -delete
EOF
chmod 700 /usr/local/bin/tenshi-backup
echo "30 3 * * * root /usr/local/bin/tenshi-backup" > /etc/cron.d/tenshi-backup

echo "== 11. Updates from GitHub every 5 minutes (only acts when something changed)"
cat > /usr/local/bin/tenshi-deploy <<EOF
#!/usr/bin/env bash
set -e
cd $APP
OLD=\$(git rev-parse HEAD)
sudo -u tenshi git fetch --quiet origin $BRANCH
NEW=\$(git rev-parse origin/$BRANCH)
[ "\$OLD" = "\$NEW" ] && exit 0
sudo -u tenshi git reset --quiet --hard origin/$BRANCH
if ! git diff --quiet "\$OLD" "\$NEW" -- platform/requirements.txt; then sudo -u tenshi $APP/platform/.venv/bin/pip install -q -r platform/requirements.txt; fi
if ! git diff --quiet "\$OLD" "\$NEW" -- platform/; then systemctl restart tenshi-cms; fi
logger -t tenshi-deploy "deployed \$NEW"
EOF
chmod 755 /usr/local/bin/tenshi-deploy
git config --system --get-all safe.directory | grep -qx "$APP" || git config --system --add safe.directory "$APP"
chmod 644 /etc/gitconfig
echo "*/5 * * * * root /usr/local/bin/tenshi-deploy" > /etc/cron.d/tenshi-deploy

echo "== 12. Start everything"
systemctl daemon-reload
systemctl enable --now tenshi-tls-ask tenshi-cms >/dev/null
systemctl restart tenshi-cms
systemctl reload caddy || systemctl restart caddy
sleep 3
systemctl is-active tenshi-cms tenshi-tls-ask caddy
curl -s -o /dev/null -w "CMS on 127.0.0.1:8000 -> HTTP %{http_code}\n" http://127.0.0.1:8000/login
echo "== done"
