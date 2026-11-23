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
