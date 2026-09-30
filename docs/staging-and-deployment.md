# Guía de Despliegue, CI/CD y Ambiente de Staging

Este documento detalla los procedimientos de integración continua, despliegue y operación del ambiente de Staging y Producción para Bull Dog Solution.

> **Estado al 2026-09-28:** AWS staging está completamente eliminado; no hay infraestructura, URL/IP, base de datos, archivos ni secretos de staging. La base anterior, todos los objetos/versiones y los secretos se borraron sin respaldo recuperable. Esta guía describe cómo volver a crear el ambiente, no cómo operar uno que siga activo.

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
- **Staging (preproducción, objetivo de IaC):** PostgreSQL dedicada, Google Drive compartido para evidencias, firmas y reportes, y documentos de Google Sheets exclusivos de pruebas (`GOOGLE_SPREADSHEET_ID` y `GOOGLE_TECHNICIANS_SPREADSHEET_ID`). Actualmente no existen recursos ni datos de staging en AWS. CDK configura `STORAGE_PROVIDER=drive`; las credenciales dedicadas de Drive se entregan al secreto runtime mediante el script seguro.
- **Producción:** Infraestructura productiva con políticas de respaldo continuo y hoja principal de clientes y salidas.

Cada entorno cuenta con sus propias claves criptográficas asimétricas para JWT (`JWT_ACCESS_PRIVATE_KEY`, `JWT_REFRESH_PRIVATE_KEY`), credenciales de base de datos y configuración de la cuenta de servicio y el Drive compartido que utilizará.

## 3. Topología objetivo de producción

Esta sección describe el objetivo general para producción. La arquitectura de staging declarada en IaC (actualmente eliminada en AWS) se documenta en la sección 5 y en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

- **Frontend & API:** Despliegue bajo el mismo dominio público o mediante reverse proxy (ej. Nginx, Caddy o Cloudflare) mapeando `/api` directamente a la instancia de Express y `/` al frontend estático SPA/PWA. Esto elimina complejidades de cookies de terceros y simplifica CORS.
- **Base de Datos:** PostgreSQL gestionado (ej. Neon, Supabase o AWS RDS PostgreSQL) con migración ejecutada mediante `infra/scripts/migrate.sh` antes de conmutar tráfico.
- **Archivos de aplicación:** Google Drive compartido privado para evidencias, firmas y reportes. S3 permanece como adaptador alternativo en el código, pero no se provisiona ni se usa en staging.

## 4. Procedimiento de Migración y Despliegue

1. **Ejecución de migraciones:**
   ```bash
   ./infra/scripts/migrate.sh
   ```
2. **Despliegue de versión:** Inicio de contenedores de API y actualización de artefactos frontend.
3. **Smoke Tests Automáticos:**
   ```bash
   TARGET_URL="http://<ipv4-publica-actual>" ./infra/scripts/smoke-test.sh
   ```
   El script verifica automáticamente liveness (`/health/live`), readiness (`/health/ready`), métricas (`/metrics`) y documentación OpenAPI.
4. **Procedimiento de Rollback:** En caso de fallo crítico detectado en smoke tests o métricas, se revierte el contenedor a la versión de imagen previa y se restaura el respaldo de base de datos previo mediante `infra/scripts/restore.sh`.

## 5. Arquitectura objetivo para redeploy de staging (cuenta 075566976700)

El ambiente de staging **no está desplegado actualmente**. `infra/cdk` define la arquitectura para un
futuro redeploy en Ohio (`us-east-2`); los diagramas y recursos listados aquí son objetivo de IaC,
no un inventario vivo. No hay IP ni URL que se pueda consultar.

El teardown del 2026-09-28 eliminó los stacks Application/Foundation, `CDKToolkit`, RDS y sus
respaldos automáticos, bucket S3 histórico y todas sus versiones, imágenes ECR, logs retenidos, secreto
runtime, ALB, CloudFront, NAT y VPC. **El contenido anterior de la base de datos y archivos se perdió
irreversiblemente; no quedó snapshot final ni versión de objeto para recuperar.**

Recursos principales previstos por CDK (no existen actualmente en AWS):

- VPC de dos zonas de disponibilidad, con subredes públicas, privadas y aisladas.
- PostgreSQL RDS privado, cifrado, con un día de respaldos automáticos y protección contra borrado. La retención de siete días es un objetivo previo a producción, no la configuración actual.
- Google Drive compartido privado como destino de evidencias, firmas y reportes. CDK fija `STORAGE_PROVIDER=drive` y no provisiona recursos S3 ni otorga permisos S3 al task role. Antes del redeploy, configura credenciales dedicadas con `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY` y `GOOGLE_DRIVE_SHARED_DRIVE_ID` junto con las credenciales existentes de Sheets.
- Un host ECS sobre EC2 `t3a.medium` con una tarea en modo `bridge` (migración, API y web); la API sólo inicia después de migrar y sembrar. El host está en subred pública con IPv4 efímera, sin Elastic IP ni NAT Gateway; el security group permite HTTP público por TCP/80, sin SSH ni acceso público al puerto 3000.
- No se provisionan Application Load Balancer ni CloudFront. La URL HTTP usa la IPv4 pública efímera del host, que puede cambiar cuando la instancia se reemplace o se detenga/inicie.
- Secretos de aplicación en Secrets Manager. El task definition inyecta las credenciales dedicadas de Sheets y Drive desde el secreto runtime; el script requiere valores de Drive separados y nunca imprime su contenido.
- Despliegue continuo desde `main` mediante GitHub Actions y OIDC.

El detalle de subredes, security groups, dependencias de contenedores, retención y límites de disponibilidad está en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

En un redeploy, el acceso directo por IP usará HTTP sin TLS: usuario, contraseña, cookies y tráfico
viajarán sin cifrado. Usalo sólo para pruebas y no ingreses datos reales hasta configurar dominio y
HTTPS. La IP será efímera y cambiará si se reemplaza o detiene/inicia la instancia.

### Recrear staging desde cero

Se requiere AWS CLI v2 autenticada en la cuenta correcta y un archivo JSON de cuenta de servicio
de Google. El archivo debe mantenerse fuera del repositorio.

```bash
# Configurar SSO una sola vez; después iniciar sesión antes de operar.
aws configure sso
aws sso login
aws sts get-caller-identity # Confirmar Account: 075566976700

pnpm infra:bootstrap
pnpm infra:foundation

AWS_REGION=us-east-2 node --env-file=.env infra/scripts/configure-staging-secrets.mjs

pnpm infra:deploy
```

El bootstrap debe repetirse porque se eliminó `CDKToolkit`. `pnpm infra:foundation` crea una base
nueva y vacía, el secreto de credenciales de base y el proveedor/rol OIDC de
GitHub; no restaura información anterior. El proveedor y rol OIDC de AWS anteriores se eliminaron
con Foundation. El estado de `AWS_STAGING_READY` en GitHub no se consultó ni modificó; mantenelo
distinto de `true` hasta terminar el redeploy y validar el smoke test. El script local
`configure-staging-secrets.mjs` vuelve a crear el secreto runtime. El stack Application volverá a
crear los recursos de aplicación declarados actualmente en CDK.

El script genera los valores de runtime según su configuración y los guarda en Secrets Manager sin
imprimirlos. No se debe asumir que sobreviven valores del ambiente eliminado; prepare sus datos de
entrada mediante el mecanismo seguro aprobado. `.env` debe incluir `GOOGLE_SPREADSHEET_ID`,
`GOOGLE_TECHNICIANS_SPREADSHEET_ID`, `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY` (o
`GOOGLE_SERVICE_ACCOUNT_FILE`), además de credenciales Drive dedicadas
`GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY` y `GOOGLE_DRIVE_SHARED_DRIVE_ID` y
`SEED_CLIENT_ADMIN_EMAIL`. Las credenciales de Drive no se infieren ni reutilizan desde Sheets.
Esta guía no proporciona ni recupera secretos.

Para actualizar el secreto runtime recreado, repita el comando con `--overwrite` sólo después de
validar los valores de entrada:

```bash
AWS_REGION=us-east-2 node --env-file=.env infra/scripts/configure-staging-secrets.mjs --overwrite
```

La actualización crea una nueva versión en Secrets Manager, pero las tareas ECS ya iniciadas conservan
los valores inyectados al arrancar. Fuerce un nuevo despliegue o reinicie el servicio antes de
validar. La rotación de las claves JWT invalida los tokens emitidos con las claves anteriores;
planifique el impacto sobre sesiones activas.

Para habilitar el despliegue automático, configure la variable de repositorio en GitHub: **Settings >
Secrets and variables > Actions > Variables**, con nombre `AWS_STAGING_READY` y valor exacto `true`.
También existe el CLI:

```bash
gh variable set AWS_STAGING_READY --body true --repo luistorres-idt/puk
```

El workflow sólo despliega cuando `AWS_STAGING_READY` vale `true`. Confirmá su configuración actual
en GitHub; no se debe habilitar hasta completar bootstrap, redeploy, recreación del secreto y smoke
test.

Después del redeploy, se puede consultar la IPv4 efímera del host (antes no existe una IP de staging):

```bash
ASG_NAME=$(aws cloudformation describe-stacks \
  --region us-east-2 \
  --stack-name PukStagingApplication \
  --query "Stacks[0].Outputs[?OutputKey=='EcsHostAutoScalingGroupName'].OutputValue" \
  --output text)
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --region us-east-2 \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[?LifecycleState=='InService'].InstanceId | [0]" --output text)
PUBLIC_IP=$(aws ec2 describe-instances --region us-east-2 --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
echo "http://$PUBLIC_IP"
```

Una vez recreado el rol `puk-staging-github-deploy` y verificado el ambiente, cada ejecución exitosa del pipeline CI sobre
`main` puede activar `.github/workflows/deploy-staging.yml` y realizar el despliegue y smoke test.
No habilites el workflow antes de completar bootstrap, redeploy, recreación del secreto runtime y
smoke test.

### Diagnóstico, incidente y rollback

Diagnóstico de sólo lectura, sin imprimir secretos:

```bash
aws cloudformation describe-stacks --region us-east-2 --stack-name PukStagingApplication
aws ecs describe-services --region us-east-2 --cluster puk-staging --services <service-name>
aws ecs list-tasks --region us-east-2 --cluster puk-staging --service-name <service-name>
aws logs tail /puk/staging/migration --region us-east-2 --since 30m
aws logs tail /puk/staging/api --region us-east-2 --since 30m
```

Después de un redeploy, consulte la IPv4 pública actual con el procedimiento anterior y ejecute:

```bash
TARGET_URL="http://<ipv4-publica-actual>" ./infra/scripts/smoke-test.sh
```

El smoke test comprueba `/health/live`, `/health/ready`, `/metrics` y `/docs/`. Si falla una
migración, la API no inicia: conserve los logs, no repita el despliegue a ciegas y evalúe la
migración antes de corregirla. El circuit breaker de ECS puede revertir la revisión de aplicación.
En un ambiente recreado, `RETAIN` protege algunos recursos frente a eliminación del stack; no es
un respaldo ni recupera los datos anteriores. Para cualquier futura recuperación, use sólo un
respaldo verificado y `infra/scripts/restore.sh` con aprobación operativa.

Los assets desplegados por CI corresponden a `workflow_run.head_sha`. Si se despliega CDK
manualmente, registre antes el SHA de Git usado junto con la revisión de ECS y el cambio aplicado.

El servicio usa un solo host y despliegues stop-before-start (0 % mínimo, 100 % máximo): cada
actualización puede causar una interrupción breve mientras ECS detiene la tarea anterior y arranca
la nueva. No hay capacidad redundante ni reemplazo sin interrupción ante una falla del host. El
host usa CPU credits `standard`; bajo carga sostenida puede reducirse el rendimiento al agotarse
el balance, en vez de generar cargos de surplus.

### Costos y teardown

Actualmente no hay recursos de staging generando costos. Después de un redeploy, RDS, el host EC2
siempre encendido, EBS y su IPv4 pública efímera generarán costos aunque no haya tráfico. Staging no
crea NAT Gateway ni Elastic IP. Las políticas `RETAIN` futuras no sustituyen backups: coordine
titularidad, respaldos y retención antes de un teardown posterior.
