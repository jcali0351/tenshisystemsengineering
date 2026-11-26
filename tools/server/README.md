# The Tenshi server (tenshisystems.com)

A Hostinger **KVM 2** VPS in Kuala Lumpur running **Ubuntu 24.04**. It serves:

| Address | What |
|---|---|
| `https://tenshisystems.com` | the website (the files in this repository) |
| `https://www.tenshisystems.com` | redirects to the address above |
| `https://cms.tenshisystems.com` | the Tenshi CMS (`platform/`) |
| `https://files.tenshisystems.com` | web file manager (File Browser) over `/srv/tenshi`, password protected |
| `https://<name>.tenshisystems.com` | client sites built by the CMS (HTTPS certificates are issued on first visit) |

## How it's put together

- **Code:** `/srv/tenshi/app`, a clone of this repository's `tenshi-cms` branch. Every 5 minutes `tenshi-deploy` pulls new
  commits; the CMS restarts only when `platform/` changed, and Python packages are reinstalled only when
  `platform/requirements.txt` changed. So: **push to GitHub, and the live site updates within 5 minutes.**
- **CMS data:** `/srv/tenshi/data` (the database, uploaded media, builds, `secret.key`). Never in git, never served.
- **CMS service:** `tenshi-cms` (systemd), settings in `/etc/tenshi-cms.env`, runs as the `tenshi` user on 127.0.0.1:8000.
- **Web server:** Caddy, `/etc/caddy/Caddyfile`. HTTPS for everything is automatic. Private folders (`platform/`,
  `tools/`, `.git/`, `docs/` and so on) answer 404. `tenshi-tls-ask` makes sure certificates are only issued for real
  `*.tenshisystems.com` names.
- **Leaderboards:** `tenshi-scores` (systemd, `tools/server/scores_service.py`) on 127.0.0.1:9126 behind
  `https://tenshisystems.com/api/scores`. Finished runs from the three homepage games are kept in
  `/srv/tenshi/data/scores/scores.db` (SQLite: name, stats, date; no IPs) and shown on the `leaderboard-*.html` pages.
  To remove a run: `sqlite3 /srv/tenshi/data/scores/scores.db "DELETE FROM runs WHERE id = ..."` (find it with SELECT first).
- **File manager:** `tenshi-files` (systemd, File Browser) on 127.0.0.1:9125, runs as `tenshi`, can only see `/srv/tenshi`.
  Its users live in `/srv/tenshi/data/filebrowser/filebrowser.db`; the first sign-in is in `/root/tenshi-files-admin.txt`.
  Files under `app/` are a git clone: `tenshi-deploy` resets them to GitHub on the next push, so change the website through
  git or the CMS, and use the file manager for downloads, uploads to `data/`, logs and contact messages.
- **Security:** firewall (ufw) allows only SSH, 80 and 443; SSH accepts keys only; fail2ban; automatic security updates.
- **Backups:** every night at 03:30 into `/var/backups/tenshi` (kept 14 days), plus Hostinger's weekly snapshot.
- **DNS:** at Hostinger: `@`, `cms` and `*` point to the server (A and AAAA); `www` is a CNAME to the main name.

## Everyday commands (from your PC, PowerShell)

```powershell
ssh -i $HOME\.ssh\tenshi_vps root@189.31.38.230
```

On the server:

```bash
systemctl status tenshi-cms          # is the CMS running?
journalctl -u tenshi-cms -n 50       # its recent log
/usr/local/bin/tenshi-deploy         # pull from GitHub right now instead of waiting
/usr/local/bin/tenshi-backup         # take a backup right now
cat /root/tenshi-cms-admin.txt       # the first CMS admin sign-in (change the password after signing in)
cat /root/tenshi-files-admin.txt     # the file manager's sign-in (change it under Settings after signing in)
```

## Rebuilding from scratch

On a fresh Ubuntu 24.04 server with your SSH key installed:

```powershell
Get-Content tools\server\setup.sh | ssh -i $HOME\.ssh\tenshi_vps root@<server-ip> "bash -s"
```

It's safe to run again on the live server: it updates packages and settings and leaves the CMS data and the existing admin
account alone. Restore CMS data from a backup into `/srv/tenshi/data` before starting the service on a new server.

## Changing the web server config (Caddy)

The config is `tools/server/Caddyfile.template` (setup.sh writes it on a new server). To apply a change to the
running server after it has been pushed and deployed:

```bash
ssh -i ~/.ssh/tenshi_vps root@189.31.38.230
/usr/local/bin/tenshi-deploy                          # get the newest template now
bash /srv/tenshi/app/tools/server/caddy-update.sh     # shows the diff, asks, backs up, validates, reloads, checks
```

It keeps a backup next to the live file (`/etc/caddy/Caddyfile.bak-<date>`) and puts it back by itself if the reload
or the check fails. What the template sets: HTTP/3 off (h1 + h2), zstd/gzip compression, one-year caching for files
with a `?v=` tag or a dated model file name, a day for other static files, `no-cache` for pages and JSON, and security
headers (HSTS with subdomains, X-Frame-Options SAMEORIGIN, Permissions-Policy, and a report-only CSP).

### The Tenshi Editor login

Caddy asks for a user name and password before it serves `admin.html` or anything in `admin/` (`basic_auth` in the
template). Only a bcrypt hash is kept, in `/etc/caddy/tenshi-editor.auth` (made by `editor-password.sh` with
`caddy hash-password`; never commit a password). `caddy-update.sh` asks for the login the first time; to change it later:

```
bash /srv/tenshi/app/tools/server/caddy-update.sh --editor-password
```

## Client sites on their own domains (certificate guard)

`tenshi-tls-ask` (port 9123) says yes to any `<word>.tenshisystems.com`, real or not, and no to every custom domain.
The CMS now answers the same question itself (`/__tls/ask`, `platform/cms/domains.py`): yes only for existing sites and
for custom domains attached under a site's **Settings › Custom domains**. To switch Caddy over (once):

```
bash /srv/tenshi/app/tools/server/tenshi-tls-ask.sh                       # checks the CMS, shows the diff, asks, backs up, validates, reloads, checks
bash /srv/tenshi/app/tools/server/tenshi-tls-ask.sh --disable-old-guard   # same, then stops the old :9123 service
bash /srv/tenshi/app/tools/server/tenshi-tls-ask.sh --rollback            # undo: the newest Caddyfile backup back in place
```

`Caddyfile.template` already has the new ask line, so `caddy-update.sh` keeps it. A client then points their domain's
DNS at this server (`www` CNAME to `<name>.tenshisystems.com`, the bare domain A/AAAA to the server) and HTTPS starts on
the first visit.

## Lead emails from the CMS

Form blocks on client sites can email each new message to the form's recipient. The CMS uses the same SMTP mailbox
as the website contact form. To turn it on (once):

```bash
ssh -i ~/.ssh/tenshi_vps root@189.31.38.230
bash /srv/tenshi/app/tools/server/cms-mail-setup.sh   # copies SMTP_* from /etc/tenshi-contact.env, backs up, restarts, checks
```

It writes `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and `CONTACT_FROM` if set) into `/etc/tenshi-cms.env`
(mode 600), keeps `/etc/tenshi-cms.env.bak-<date>`, and restores it if the CMS doesn't come back. If the contact
form has no SMTP login yet it asks for one (the password isn't echoed). Until then leads still arrive in the
dashboard and the Leads screen shows "Email notifications are off".
