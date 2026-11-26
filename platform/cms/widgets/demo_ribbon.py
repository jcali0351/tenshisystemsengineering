"""demo_ribbon: the small "Demo site by Tenshi Systems" label on every page of a demo site (demo_sites.py, render.py)."""

from markupsafe import Markup
from pydantic import BaseModel

from . import Widget, register

HTML = ('<a class="tw-demo-ribbon" href="https://tenshisystems.com/" target="_blank" rel="noopener" '
        'title="A sample website for a fictional business, made with the Tenshi CMS">'
        '<b>DEMO</b> Demo site by Tenshi Systems</a>')

register(Widget(name="demo_ribbon", label="Demo ribbon", about="Marks a demo site.", config=BaseModel,
                render=lambda b, c: Markup(""), assets=["demo_ribbon.css"], hidden=True))
