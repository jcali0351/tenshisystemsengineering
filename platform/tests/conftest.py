import os

# The public demo sites (cms/demo_sites.py) are built on start-up in production; tests build them on purpose only.
os.environ.setdefault("TENSHI_DEMO_SITES", "0")
os.environ.setdefault("TENSHI_SCHEDULER", "0")    # cms/scheduler.py: tests call run_once() themselves
