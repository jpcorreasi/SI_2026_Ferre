from django.db import models

# No persistent models are defined for the reports app.
# Reports are generated on-demand by querying other apps' models.
# Add ReportSnapshot or similar here if caching of generated reports is needed.
