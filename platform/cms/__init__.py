"""
The Tenshi CMS: the business launch platform's control center.

    app.py        the web server: every screen and the JSON API, and serving client sites
    config.py     where things are kept, and settings
    db.py         the database (SQLite) and its tables
    auth.py       accounts and passwords
    sites.py      create, deploy, roll back, clone, back up, restore, health, export
    media.py      the Media Center: uploads, compression, resizing, cropping, SVG cleaning
    render.py     turns business data + pages + a template into web pages
    blocks.py     the page builder's block types
    templates.py  the Template Gallery: create, clone, version, restore
    ui/           the CMS screens (Jinja2 HTML)
    static/       the CMS's own CSS and JavaScript (builder.js is the page builder)
"""
