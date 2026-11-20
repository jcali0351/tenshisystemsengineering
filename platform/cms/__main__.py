"""
Start the Tenshi CMS:   .venv\\Scripts\\python -m cms      (from the platform folder)

Then open http://localhost:8000 . The first visit asks you to create the admin account.
Client sites appear at http://<their-address>.localhost:8000 once deployed.
"""

import uvicorn

from . import config

if __name__ == "__main__":
    print(f"\n  Tenshi CMS: http://localhost:{config.PORT}\n  Client sites: http://<address>.{config.SITES_DOMAIN}:{config.PORT}\n")
    uvicorn.run("cms.app:app", host=config.HOST, port=config.PORT, reload=False)
