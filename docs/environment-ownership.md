# Variables, secretos y responsables

Los valores locales no sensibles se documentan en `.env.example`. Los secretos reales viven en el gestor de secretos de cada ambiente y nunca se registran en Git ni en logs.

| Grupo       | Variables                                                       | Sensible          | Responsable propuesto  |
| ----------- | --------------------------------------------------------------- | ----------------- | ---------------------- |
| Aplicación  | `NODE_ENV`, `PORT`, `APP_ORIGIN`, `API_ORIGIN`, `TRUST_PROXY`   | No                | Plataforma             |
| PostgreSQL  | `DATABASE_URL`, `DIRECT_URL`                                    | Sí                | Plataforma             |
| JWT         | `JWT_*_PRIVATE_KEY`, `JWT_*_PUBLIC_KEY`, issuer, audience y TTL | Claves privadas   | Seguridad/Plataforma   |
| Cookies     | `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`            | No                | Backend                |
| S3          | `S3_ENDPOINT`, región, bucket, access key y secret key          | Credenciales      | Plataforma             |
| Sheets      | spreadsheet ID, cuenta de servicio, clave privada y pestañas    | Credenciales e ID | Operaciones/Plataforma |
| Límites     | tamaños, TTL de URLs y caché                                    | No                | Backend/Producto       |
| Resiliencia | timeouts, reintentos, breaker y outbox                          | No                | Backend/SRE            |
| Logs        | `LOG_LEVEL`                                                     | No                | SRE                    |

Desarrollo puede usar PostgreSQL y MinIO locales con las credenciales ficticias de `.env.example`. La integración de Sheets usa un adaptador simulado hasta que Operaciones entregue un documento exclusivo y Plataforma inyecte la cuenta de servicio.
