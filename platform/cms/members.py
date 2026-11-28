"""
members.py: who belongs to which site (the site_members table, db.py).

Roles on a site (like WordPress's roles):
    author       writes and publishes their own blog posts; Media Center
    contributor  writes their own posts and submits them for review; an editor, owner or admin publishes them
    owner    the client who owns the site: may change the site's own connections and safety settings (the Store's
             Shopify connection, extra allowed hosts for the page security policy, the brand lock), on top of
             everything an editor can do
    editor   content only (the same as a CMS editor today)
CMS admins can do everything on every site whether or not they are members. Only admins add or remove members
(Settings & theme › People, or the Users screen).
"""

from . import db

ROLES = {"owner": "Owner: the site's store connection, security and brand settings, plus content",
         "editor": "Editor: content only",
         "author": "Author: writes and publishes their own blog posts, uploads pictures (like WordPress's Author)",
         "contributor": "Contributor: writes their own posts and sends them for review; an editor publishes them"}
WRITERS = ("author", "contributor")          # roles limited to their own posts and the Media Center (access.py)


class MemberError(ValueError):
    pass


def role_on(user, site_id):
    """'admin', 'owner', 'editor' or None for this user on this site."""
    if not user:
        return None
    if user.get("role") == "admin":
        return "admin"
    row = db.one("SELECT role FROM site_members WHERE site_id = ? AND user_id = ?", site_id, user["id"])
    return row["role"] if row else None


def can_manage(user, site_id):
    """Admins and the site's owners: the site's own connections, security and brand settings."""
    return role_on(user, site_id) in ("admin", "owner")


def for_site(site_id):
    return db.all("SELECT m.user_id, m.role, m.created_at, u.name, u.email, u.role AS cms_role FROM site_members m "
                  "JOIN users u ON u.id = m.user_id WHERE m.site_id = ? ORDER BY m.role DESC, u.name", site_id)


def for_user(user_id):
    return db.all("SELECT m.site_id, m.role, s.name FROM site_members m JOIN sites s ON s.id = m.site_id "
                  "WHERE m.user_id = ? ORDER BY s.name", user_id)


def set_member(site_id, user_id, role, by=None):
    if role not in ROLES:
        raise MemberError("A member is an owner, editor, author or contributor.")
    if not db.one("SELECT id FROM users WHERE id = ?", user_id):
        raise MemberError("That user doesn't exist.")
    db.run("INSERT INTO site_members (site_id, user_id, role, created_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, user_id) DO UPDATE SET role = excluded.role", site_id, user_id, role, db.now())
    db.log("Site member set", f"user #{user_id}: {role}", by, site_id)


def remove_member(site_id, user_id, by=None):
    db.run("DELETE FROM site_members WHERE site_id = ? AND user_id = ?", site_id, user_id)
    db.log("Site member removed", f"user #{user_id}", by, site_id)
