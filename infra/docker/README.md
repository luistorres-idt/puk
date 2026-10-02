# Local container stack

The root Compose file builds the API and web applications and starts PostgreSQL and MinIO. Development defaults are non-production values and can be overridden through a local `.env` file.

The MinIO initialization container creates the configured private bucket. Named volumes preserve PostgreSQL and object data between restarts; `docker compose down` leaves both volumes intact.

The pinned MinIO image is the final official container published by the archived community repository. It is restricted to local development and is not the selected staging provider: CDK configures Google Drive shared storage. AWS staging is currently deleted, and production has no deployment of record. S3 remains an optional code adapter, not a requirement for staging or production.
