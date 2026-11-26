"""
widgets/lightbox.py: the shared full-screen viewer (pictures and videos) the gallery modules use. Not a block of its
own (hidden): widgets list it in requires=["lightbox"] and its files come with them.
"""

from markupsafe import Markup
from pydantic import BaseModel

from . import Widget, register

register(Widget(name="lightbox", label="Lightbox", about="Full-screen pictures and videos.", config=BaseModel,
                render=lambda block, ctx: Markup(""), assets=["lightbox.css", "lightbox.js"], hidden=True))
