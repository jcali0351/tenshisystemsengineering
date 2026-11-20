"""
Start the Tenshi CMS from any folder:

    platform\\.venv\\Scripts\\python platform\\run_cms.py            (add --demo for a sample business site)

(the same as "python -m cms" inside the platform folder). Then open http://localhost:8000
The first visit asks you to create the admin account.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)          # so "import cms" and "import tenshi" work wherever this is started from
os.chdir(HERE)

import uvicorn  # noqa: E402

from cms import config  # noqa: E402

if __name__ == "__main__":
    if "--demo" in sys.argv:                  # add the sample business first (does nothing if it already exists)
        from cms import demo
        demo.make_demo()
    print(f"\n  Tenshi CMS:   http://localhost:{config.PORT}\n  Client sites: http://<address>.{config.SITES_DOMAIN}:{config.PORT}\n")
    uvicorn.run("cms.app:app", host=config.HOST, port=config.PORT)
