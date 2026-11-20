"""
Tenshi platform prototype: the Business Data Engine in plain Python.

The idea in one sentence: a business is described ONCE, as a JSON "business profile", and every website design
(a folder of Jinja2 templates) is just a way of showing that profile.

The parts, each in its own small file:
    profile.py    read, check and look inside a business profile          ("what is the business?")
    blueprint.py  read a design's blueprint and check required fields     ("what does this design need?")
    scanner.py    find every {{ variable }} a design uses                  ("which boxes does the CMS need?")
    forms.py      turn those variables into CMS form fields                ("draw the boxes")
    builder.py    render a design with a profile into a static website,
                  and pack it into a ZIP the owner can take anywhere       ("make the website")
    cli.py        the commands you type:  python -m tenshi …

Start with README.md in the platform folder.
"""

__version__ = "0.1.0"
