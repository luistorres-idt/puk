# Guía de Despliegue, CI/CD y Ambiente de Staging

Este documento detalla los procedimientos de integración continua, despliegue y operación del ambiente de Staging y Producción para Bull Dog Solution.

## 1. Pipeline de Integración Continua (CI)

El archivo `.github/workflows/ci.yml` define el flujo de validación automática en cada `push` o `pull_request`:

1. **Instalación de dependencias:** Uso de `pnpm install --frozen-lockfile` con almacenamiento en caché.
2. **Validación Prisma:** Ejecución de `pnpm prisma:validate` y generación del cliente Prisma.
3. **Análisis Estático (Linting):** Ejecución de `pnpm lint` aplicando las reglas de ESLint de arquitectura modular.
4. **Comprobación de Tipos (Typecheck):** Ejecución de `pnpm typecheck` en todos los paquetes del monorepo.
5. **Pruebas Unitarias y de Integración:** Ejecución de `pnpm test` con Vitest.
6. **Validación de OpenAPI:** Ejecución de `pnpm docs:validate` y verificación de contratos OpenAPI contra endpoints.
7. **Compilación (Build):** Generación de artefactos optimizados de backend y frontend web.
8. **Auditoría de Dependencias:** Ejecución de `pnpm audit` verificando 0 vulnerabilidades conocidas.
9. **Pruebas E2E:** Ejecución de pruebas con Playwright en entornos de escritorio y móvil (`pnpm test:e2e`).

## 2. Configuración de Entornos y Secretos Separados

Se deben mantener tres ambientes completamente aislados:

- **Desarrollo (Local):** `docker-compose.yml` local con PostgreSQL, MinIO y catálogo simulado de Sheets.
- **Staging (Preproducción):** Base de datos PostgreSQL dedicada, bucket S3 dedicado y documento de Google Sheets exclusivo de pruebas (`GOOGLE_SHEETS_SPREADSHEET_ID_STAGING`).
- **Producción:** Infraestructura productiva con políticas de respaldo continuo y hoja principal de clientes y salidas.

Cada entorno cuenta con sus propias claves criptográficas asimétricas para JWT (`JWT_ACCESS_PRIVATE_KEY`, `JWT_REFRESH_PRIVATE_KEY`), credenciales de base de datos y llaves de acceso a almacenamiento de objetos.

## 3. Topología objetivo de producción

Esta sección describe el objetivo general para producción. El estado implementado de staging se documenta en la sección 5 y en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

- **Frontend & API:** Despliegue bajo el mismo dominio público o mediante reverse proxy (ej. Nginx, Caddy o Cloudflare) mapeando `/api` directamente a la instancia de Express y `/` al frontend estático SPA/PWA. Esto elimina complejidades de cookies de terceros y simplifica CORS.
- **Base de Datos:** PostgreSQL gestionado (ej. Neon, Supabase o AWS RDS PostgreSQL) con migración ejecutada mediante `infra/scripts/migrate.sh` antes de conmutar tráfico.
- **Almacenamiento de Objetos:** AWS S3 o Cloudflare R2 con bloqueo de acceso público activado.

## 4. Procedimiento de Migración y Despliegue

1. **Ejecución de migraciones:**
   ```bash
   ./infra/scripts/migrate.sh
   ```
2. **Despliegue de versión:** Inicio de contenedores de API y actualización de artefactos frontend.
3. **Smoke Tests Automáticos:**
   ```bash
   TARGET_URL="https://staging.ejemplo.com" ./infra/scripts/smoke-test.sh
   ```
   El script verifica automáticamente liveness (`/health/live`), readiness (`/health/ready`), métricas (`/metrics`) y documentación OpenAPI.
4. **Procedimiento de Rollback:** En caso de fallo crítico detectado en smoke tests o métricas, se revierte el contenedor a la versión de imagen previa y se restaura el respaldo de base de datos previo mediante `infra/scripts/restore.sh`.

## 5. Staging en AWS (cuenta 075566976700)

El ambiente de staging está definido con AWS CDK en `infra/cdk` y se despliega en Ohio
(`us-east-2`). Mientras no exista un dominio propio, CloudFront proporciona una URL HTTPS.

Recursos principales:

- VPC de dos zonas de disponibilidad, con subredes públicas, privadas y aisladas.
- PostgreSQL RDS privado, cifrado, con un día de respaldos automáticos y protección contra borrado. La retención de siete días es un objetivo previo a producción, no la configuración actual.
- Bucket S3 privado, cifrado y versionado para evidencias y reportes.
- Una tarea ECS Fargate con migración, API y web; la API sólo inicia después de migrar y sembrar.
- Application Load Balancer y CloudFront para una entrada HTTPS única.
- Secretos de aplicación en Secrets Manager y permisos S3 mediante IAM, sin access keys estáticas.
- Despliegue continuo desde `main` mediante GitHub Actions y OIDC.

El detalle de subredes, security groups, rutas CloudFront, dependencias de contenedores, retención y límites de disponibilidad está en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

### Primer despliegue

Se requiere AWS CLI v2 autenticada en la cuenta correcta y un archivo JSON de cuenta de servicio
de Google. El archivo debe mantenerse fuera del repositorio.

```bash
aws configure sso
aws sso login
aws sts get-caller-identity

pnpm infra:bootstrap
pnpm infra:foundation

AWS_REGION=us-east-2 node --env-file=.env infra/scripts/configure-staging-secrets.mjs

pnpm infra:deploy

# Habilitar los siguientes despliegues automáticos desde GitHub Actions
gh variable set AWS_STAGING_READY --body true --repo luistorres-idt/puk
```

El script genera automáticamente dos pares Ed25519 para JWT y una contraseña inicial aleatoria.
Nunca imprime la contraseña ni otros valores sensibles. El operador debe recuperar la contraseña
de seed mediante el acceso seguro aprobado a Secrets Manager, sin mostrarla en terminal, logs,
capturas, chat ni tickets.

Para rotar el secreto existente, repita el comando con `--overwrite` sólo después de validar los
valores de entrada:

```bash
AWS_REGION=us-east-2 node --env-file=.env infra/scripts/configure-staging-secrets.mjs --overwrite
```

La rotación crea una nueva versión en Secrets Manager, pero las tareas ECS ya iniciadas conservan
los valores inyectados al arrancar. Fuerce un nuevo despliegue o reinicie el servicio antes de
validar. La rotación de las claves JWT invalida los tokens emitidos con las claves anteriores;
planifique el impacto sobre sesiones activas.

Para habilitar el despliegue automático, configure la variable de repositorio en GitHub: **Settings >
Secrets and variables > Actions > Variables**, con nombre `AWS_STAGING_READY` y valor exacto `true`.
También existe el CLI:

```bash
gh variable set AWS_STAGING_READY --body true --repo luistorres-idt/puk
```

La variable no se presupone configurada. El workflow sólo despliega cuando su valor es `true`.

Para obtener nuevamente la URL:

```bash
aws cloudformation describe-stacks \
  --region us-east-2 \
  --stack-name PukStagingApplication \
  --query "Stacks[0].Outputs[?OutputKey=='StagingUrl'].OutputValue" \
  --output text
```

Una vez creado el rol `puk-staging-github-deploy`, cada ejecución exitosa del pipeline CI sobre
`main` puede activar `.github/workflows/deploy-staging.yml` y realizar el despliegue y smoke test.
El workflow permanece deshabilitado mientras `AWS_STAGING_READY` no tenga el valor `true`, evitando
que intente desplegar antes de completar el bootstrap y la carga inicial de secretos.

### Diagnóstico, incidente y rollback

Diagnóstico de sólo lectura, sin imprimir secretos:

```bash
aws cloudformation describe-stacks --region us-east-2 --stack-name PukStagingApplication
aws ecs describe-services --region us-east-2 --cluster puk-staging --services <service-name>
aws ecs list-tasks --region us-east-2 --cluster puk-staging --service-name <service-name>
aws logs tail /puk/staging/migration --region us-east-2 --since 30m
aws logs tail /puk/staging/api --region us-east-2 --since 30m
```

Después de un despliegue, obtenga la URL de CloudFront con el comando anterior y ejecute:

```bash
TARGET_URL="https://<cloudfront-host>" ./infra/scripts/smoke-test.sh
```

El smoke test comprueba `/health/live`, `/health/ready`, `/metrics` y `/docs/`. Si falla una
migración, la API no inicia: conserve los logs, no repita el despliegue a ciegas y evalúe la
migración antes de corregirla. El circuit breaker de ECS puede revertir la revisión de aplicación;
para una recuperación de datos use un respaldo verificado y `infra/scripts/restore.sh` con
aprobación operativa. RDS y S3 usan `RETAIN`: no los borre como parte de un rollback.

Los assets desplegados por CI corresponden a `workflow_run.head_sha`. Si se despliega CDK
manualmente, registre antes el SHA de Git usado junto con la revisión de ECS y el cambio aplicado.

### Costos y teardown

RDS tiene deletion protection y los recursos persistentes usan `RETAIN`. NAT Gateway y RDS
generan costos mientras existan, aun cuando no haya tráfico. No destruya stacks ni modifique la
protección de borrado casualmente: coordine la titularidad operativa, respaldos y retención de
RDS, S3 y logs antes de cualquier teardown.
