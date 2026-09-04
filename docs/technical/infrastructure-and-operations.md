# Infraestructura y operación

## Servicios locales

| Servicio     | Imagen/proceso        | Puerto predeterminado     | Persistencia            |
| ------------ | --------------------- | ------------------------- | ----------------------- |
| `web`        | Nginx + Vue compilado | 4173 externo / 80 interno | no                      |
| `api`        | Node.js 24 + Express  | 3000                      | no                      |
| `postgres`   | PostgreSQL 18         | 5432                      | volumen `postgres-data` |
| `minio`      | MinIO                 | 9000 API, 9001 consola    | volumen `minio-data`    |
| `minio-init` | cliente `mc`          | —                         | crea bucket privado     |

Los Dockerfiles son multi-stage. La API se despliega con dependencias de producción y usuario `node`; el frontend se construye con Vite y se sirve desde Nginx.

## Inicio rápido

```bash
pnpm install
cp .env.example .env
docker compose up --build -d
pnpm exec prisma migrate deploy
pnpm prisma:seed
```

Para desarrollo con hot reload se pueden levantar PostgreSQL/MinIO con Docker y ejecutar `pnpm dev` desde la raíz. Las versiones admitidas son Node.js 24–26 y pnpm 11.

## Variables de entorno

| Grupo         | Variables principales                                                |
| ------------- | -------------------------------------------------------------------- |
| HTTP          | `PORT`, `APP_ORIGIN`, `API_ORIGIN`, `TRUST_PROXY`                    |
| Base de datos | `DATABASE_URL`, `DIRECT_URL`                                         |
| JWT           | claves pública/privada, `JWT_ISSUER`, `JWT_AUDIENCE`, TTLs           |
| Cookies       | `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`                 |
| S3            | endpoint, región, bucket, credenciales, path style                   |
| Sheets        | spreadsheet, cuenta de servicio, clave privada y nombres de pestañas |
| Límites       | tamaños de evidencia/firma, TTL de URLs, caché                       |
| Resiliencia   | timeouts, reintentos, circuit breaker y polling                      |
| Seed          | correos y contraseñas iniciales de desarrollo                        |

La API valida todas las variables al arrancar. Los valores `development-only` activan adaptadores simulados fuera de producción; nunca deben usarse en producción.

## Procesos periódicos

- `SyncService` consulta el outbox cada `OUTBOX_POLL_INTERVAL_MS`, procesa hasta 20 operaciones y aplica backoff exponencial con jitter.
- `ReportsService` procesa hasta dos PDFs por ciclo. Recupera trabajos interrumpidos después de diez minutos.
- Ambos intervalos usan `unref()` y se cancelan durante el apagado ordenado.

## Observabilidad

- `GET /health/live`: proceso activo.
- `GET /health/ready`: PostgreSQL responde.
- `GET /metrics`: métricas Prometheus.
- `GET /health/metrics`: snapshot JSON.
- Winston produce logs JSON y Morgan registra HTTP mediante el logger central.
- Cada petición obtiene `requestId`; puede propagarse uno válido desde el cliente.

## Operaciones habituales

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm prisma:validate
pnpm docs:validate
pnpm exec prisma migrate deploy
```

Las migraciones se ejecutan una sola vez antes de activar una versión. PostgreSQL y el bucket requieren respaldos independientes. Debe probarse restauración de base y conservarse alineada con la política de retención de evidencias.

## Despliegue

El orden recomendado es: construir imágenes, respaldar, aplicar migraciones, desplegar API, validar readiness, desplegar web y ejecutar smoke tests. `/api` debe publicarse bajo el mismo dominio cuando sea posible para simplificar cookies y CORS. Producción necesita TLS, cookies `Secure`, secretos externos al repositorio y bloqueo público del bucket.
