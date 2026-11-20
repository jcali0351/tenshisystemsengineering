"""
scanner.py: find every piece of business data a design uses.

This is what makes "automatic CMS generation" work. Nobody writes the CMS form for a design by hand:
we read the design's templates and list the variables in them.

    {{ company.name }}                       ->  "company.name"
    {% for service in services %}
        {{ service.name }}                   ->  "services[].name"   (the [] means "for each item in the list")
    {% endfor %}

How: Jinja2 can turn a template into a tree of pieces (its "abstract syntax tree"). We walk that tree, and every
time we meet a name like `company` followed by `.name`, we write down "company.name". Inside a for-loop we remember
that `service` stands for "one item of services", so `service.name` becomes "services[].name".
"""

from pathlib import Path

from jinja2 import Environment, nodes

# Names that come from the platform or from Jinja itself, not from the business profile.
# The CMS should never show a box for these.
PLATFORM_NAMES = {
    "loop", "range", "true", "false", "none", "True", "False", "None", "super", "self", "varargs", "kwargs",
    "design",        # the design's colours etc., from data/templates.json
    "year",          # the current year, for the copyright line
    "form_action",   # where lead forms send their answers
    "pages",         # the list of pages, for menus
}


def scan_source(source, env=None):
    """Return the set of dotted paths used in one template's text."""
    env = env or Environment()
    tree = env.parse(source)
    found = set()
    _walk(tree, scope={}, found=found)
    return found


def scan_folder(folder):
    """Scan every template file (*.j2) in a design's folder (and its sub-folders) and return all paths, sorted."""
    env = Environment()
    found = set()
    for file in sorted(Path(folder).rglob("*.j2")):          # every template, including sub-folders like blocks/
        found |= scan_source(file.read_text(encoding="utf-8"), env)
    return tidy(found)


def tidy(paths):
    """
    Drop paths that are only "on the way" to a longer one.
    If we have "company.logo.src", the bare "company.logo" and "company" add nothing.
    A list on its own ("services[]") is kept only when nothing inside it is used.
    """
    paths = set(paths)
    keep = set()
    for p in paths:
        longer = any(other != p and (other.startswith(p + ".") or other.startswith(p + "[]")) for other in paths)
        if not longer:
            keep.add(p)
    return sorted(keep)


# ---------- walking the tree ----------

def _walk(node, scope, found):
    """
    Visit one piece of the template tree and everything inside it.
    scope maps loop variable names to what they stand for, e.g. {"service": "services[]"}.
    A name mapped to None is a loop variable we don't track (e.g. the key in `for key, value in social.items()`).
    """
    # A for-loop: work out what the loop variable stands for, then walk the loop's body with that knowledge
    if isinstance(node, nodes.For):
        list_path = _path_of(node.iter, scope)
        _walk(node.iter, scope, found)
        inner = dict(scope)
        if isinstance(node.target, nodes.Name):
            inner[node.target.name] = (list_path + "[]") if list_path else None
            if list_path:
                found.add(list_path + "[]")
        else:   # e.g. "for network, link in social.items()": don't treat network/link as business data
            for name_node in node.target.find_all(nodes.Name):
                inner[name_node.name] = None
        for child in node.body + node.else_:
            _walk(child, inner, found)
        if node.test is not None:
            _walk(node.test, inner, found)
        return

    # {% set x = … %} creates a name of the template's own: remember it so we don't list it
    if isinstance(node, nodes.Assign):
        _walk(node.node, scope, found)
        # find_all() skips the node itself, so a single name (`set b = …`) is handled on its own
        targets = [node.target] if isinstance(node.target, nodes.Name) else list(node.target.find_all(nodes.Name))
        for name_node in targets:
            scope[name_node.name] = None
        return

    # A method call like social.items(): the data is "social" itself
    if isinstance(node, nodes.Call) and isinstance(node.node, nodes.Getattr):
        path = _path_of(node.node.node, scope)
        if path:
            found.add(path)
        for child in node.args + [kw.value for kw in node.kwargs]:
            _walk(child, scope, found)
        return

    # A name or a chain like company.logo.src: write down its path
    if isinstance(node, (nodes.Name, nodes.Getattr, nodes.Getitem)):
        path = _path_of(node, scope)
        if path:
            found.add(path)
            return
        # services[:3] or similar: the part before the brackets still counts
        if isinstance(node, nodes.Getitem):
            _walk(node.node, scope, found)
            return

    for child in node.iter_child_nodes():
        _walk(child, scope, found)


def _path_of(node, scope):
    """Turn `company.logo.src` (as tree pieces) into the text "company.logo.src". None if it isn't business data."""
    if isinstance(node, nodes.Name):
        if node.ctx != "load" or node.name in PLATFORM_NAMES:
            return None
        if node.name in scope:
            return scope[node.name]          # a loop variable: "service" -> "services[]"
        return node.name
    if isinstance(node, nodes.Getattr):
        base = _path_of(node.node, scope)
        return _join(base, node.attr) if base else None
    if isinstance(node, nodes.Getitem):
        base = _path_of(node.node, scope)
        if not base:
            return None
        if isinstance(node.arg, nodes.Const) and isinstance(node.arg.value, str):
            return _join(base, node.arg.value)     # company["name"] is the same as company.name
        return base                                # services[:3] -> "services"
    if isinstance(node, nodes.Filter):
        return _path_of(node.node, scope)          # company.name | upper -> "company.name"
    return None


def _join(base, attr):
    return f"{base}{attr}" if base.endswith(".") else f"{base}.{attr}"
