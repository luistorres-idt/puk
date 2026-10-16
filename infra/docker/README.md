# Local container stack

The root Compose file builds the API and web applications and starts PostgreSQL. Development defaults are non-production values and can be overridden through a local `.env` file.

Named volumes preserve PostgreSQL data between restarts; `docker compose down` leaves the database volume intact. File features use Google Drive and require its credentials in the API environment.

S3 and MinIO have been removed from application code and local development. Google Drive is the sole file storage provider. AWS staging is currently deleted, and production has no deployment of record; no remote buckets or stored objects were modified by this cleanup.
