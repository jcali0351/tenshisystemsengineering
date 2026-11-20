"""
cli.py: the commands. Run them from the platform folder:

    python -m tenshi scan contractor                     which variables does the Contractor design use?
    python -m tenshi form contractor --html form.html    the CMS form for it (as data, or drawn as a page)
    python -m tenshi check examples/johnsons-plumbing.json   is this business ready to launch?
    python -m tenshi build examples/johnsons-plumbing.json out/site     make the website
    python -m tenshi export examples/johnsons-plumbing.json out/export.zip   make the take-it-anywhere ZIP
"""

import argparse
import json
import sys
from pathlib import Path

from . import blueprint as bp
from . import builder, forms, scanner
from . import profile as prof


def cmd_scan(args):
    for path in scanner.scan_folder(bp.TEMPLATES / args.design):
        print(path)


def cmd_form(args):
    paths = scanner.scan_folder(bp.TEMPLATES / args.design)
    form = forms.build_form(paths, bp.load(args.design))
    if args.html:
        Path(args.html).parent.mkdir(parents=True, exist_ok=True)
        with open(args.html, "w", encoding="utf-8") as f:
            f.write(forms.form_to_html(form, title=f"{bp.design(args.design)['name']}: CMS form"))
        print(f"Wrote {args.html}")
    else:
        print(json.dumps(form, indent=2, ensure_ascii=False))


def cmd_check(args):
    business = prof.load(args.profile)
    design_id = business["site"]["template"]
    missing = bp.missing_fields(business, bp.load(design_id))
    if missing:
        print(f"Not ready yet for the {design_id} design. Still to fill in:")
        for path in missing:
            print("  -", path)
        return 1
    print(f"Ready to launch: {business['company']['name']} with the {design_id} design.")
    return 0


def cmd_build(args):
    business = prof.load(args.profile)
    files = builder.build(business, args.out)
    print(f"Built {len(files)} files into {args.out}: {', '.join(files)}")


def cmd_export(args):
    business = prof.load(args.profile)
    path = builder.export_zip(business, args.zip)
    print(f"Export ready: {path}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="tenshi", description="Tenshi Business Data Engine prototype")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("scan", help="list the variables a design uses")
    p.add_argument("design")
    p.set_defaults(run=cmd_scan)

    p = sub.add_parser("form", help="build the CMS form for a design")
    p.add_argument("design")
    p.add_argument("--html", help="also draw it as an HTML page")
    p.set_defaults(run=cmd_form)

    p = sub.add_parser("check", help="check a business profile against its design's blueprint")
    p.add_argument("profile")
    p.set_defaults(run=cmd_check)

    p = sub.add_parser("build", help="render a business profile into a static website")
    p.add_argument("profile")
    p.add_argument("out")
    p.set_defaults(run=cmd_build)

    p = sub.add_parser("export", help="build and pack the complete ZIP export")
    p.add_argument("profile")
    p.add_argument("zip")
    p.set_defaults(run=cmd_export)

    args = parser.parse_args(argv)
    return args.run(args) or 0


if __name__ == "__main__":
    sys.exit(main())
