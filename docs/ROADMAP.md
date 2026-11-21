# Tenshi Systems: what's next after going live (tenshisystems.com)

Saved 2026-11-21, right after moving the site and CMS to the Hostinger server. In priority order.

## 1. Launch-readiness pack (do first)
- [ ] Switch the CMS to your own admin login and delete the temporary one (steps: sign in, Users, add yourself as Admin,
      sign in as yourself, remove admin@tenshisystems.com, delete /root/tenshi-cms-admin.txt).
- [ ] Back up the server SSH key (`~/.ssh/tenshi_vps`) somewhere off the PC (USB or password manager).
- [ ] Off-site backups: daily copy of the CMS data to Backblaze B2 or Cloudflare R2, plus a test restore.
- [ ] Uptime alerts for the site and the CMS (UptimeRobot or similar, free).
- [ ] Point the 15 pages that still name jcali0351.github.io as their official (canonical / og:url) address at tenshisystems.com.
- [ ] Add sitemap.xml and robots.txt; submit the site to Google Search Console.

## 2. Business email
- [ ] hello@tenshisystems.com forwarding to Gmail (Cloudflare Email Routing or ImprovMX: free; Hostinger mail: ~$1-3/mo).
- [ ] Show the business address on the site instead of the Gmail one.

## 3. Real integrations
- [ ] Contact form that sends: post to the CMS, store the message, email it to us (Resend free tier). Today it opens the visitor's email app.
- [ ] Tanaka AI chat back on (Claude API, monthly spend cap). It's hidden for now by one CSS rule in sandbox/neon-theme.css.
- [ ] Privacy-friendly analytics self-hosted on the server (Umami or Plausible): no cookie banner needed.
- [ ] Stripe checkout on the Launch flow, so clients can sign up and pay a monthly plan.
- [ ] Shared online leaderboards for the games (hero arcade, Station Defense, the dungeon crawler).

## 4. Housekeeping
- [ ] If leaving GitHub: switch deploys to push-to-server, set up off-site backups, then make the repo private or delete it.
- [ ] After a month or two, switch the server to yearly billing ($119.88 first year vs $24.49/month).
- [ ] Security review of the CMS before onboarding real clients (three gaps noted in an earlier session).
