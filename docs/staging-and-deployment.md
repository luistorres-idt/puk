# Guía de Despliegue, CI/CD y Ambiente de Staging

Este documento detalla los procedimientos de integración continua, despliegue y operación del ambiente de Staging y Producción para Bull Dog Solution.

> **Estado al 2026-10-09:** AWS staging está eliminado/no desplegado y producción no está desplegada. Los inventarios y procedimientos de AWS de este documento son referencias históricas o pasos para un futuro redeployment; verificá los recursos y el diff CDK antes de operar. Gmail tampoco está conectado al despliegue CDK.

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

- **Desarrollo (Local):** `docker-compose.yml` local con PostgreSQL y catálogo simulado de Sheets. Las funciones de archivos usan Google Drive.
- **Staging (pruebas):** no desplegado actualmente. La IaC describe ECS, PostgreSQL y Google Drive; verificar y desplegar explícitamente esa infraestructura antes de considerarla activa.
- **Producción:** Infraestructura productiva con políticas de respaldo continuo y hoja principal de clientes y salidas.

Cada entorno cuenta con sus propias claves criptográficas asimétricas para JWT (`JWT_ACCESS_PRIVATE_KEY`, `JWT_REFRESH_PRIVATE_KEY`), credenciales de base de datos y configuración de la cuenta de servicio y el Drive compartido que utilizará.

## 3. Topología objetivo de producción

Esta sección describe el objetivo general para producción. La arquitectura de staging y sus diferencias con el despliegue activo se documenta en la sección 5 y en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

- **Frontend & API:** Despliegue bajo el mismo dominio público o mediante reverse proxy (ej. Nginx, Caddy o Cloudflare) mapeando `/api` directamente a la instancia de Express y `/` al frontend estático SPA/PWA. Esto elimina complejidades de cookies de terceros y simplifica CORS.
- **Base de Datos:** PostgreSQL gestionado (ej. Neon, Supabase o AWS RDS PostgreSQL) con migración ejecutada mediante `infra/scripts/migrate.sh` antes de conmutar tráfico.
- **Archivos de aplicación:** Google Drive compartido privado para evidencias, firmas y reportes. S3 y MinIO fueron retirados del código y de la configuración local. El inventario histórico observó S3 en staging; staging está eliminado y ningún recurso remoto se modificó en este cambio.

## 4. Procedimiento de Migración y Despliegue

### Staging mediante CDK

El despliegue automatizado de staging se ejecuta desde `.github/workflows/deploy-staging.yml` después de un CI exitoso sobre `main`, únicamente cuando `AWS_STAGING_READY` vale exactamente `true`. El workflow hace checkout del `head_sha` validado, ejecuta `pnpm infra:deploy` y luego el smoke test. Al 2026-10-09 staging está eliminado/no desplegado; el workflow no implica que haya recursos activos.

CDK construye las imágenes Docker. Las imágenes de API y migración generan el cliente Prisma durante el build con un `DATABASE_URL` ficticio de compilación; esa generación no conecta a la base de datos de producción ni ejecuta migraciones. Al iniciar una nueva tarea ECS, el contenedor `migration` ejecuta `prisma migrate deploy` y después `prisma/seed.ts`. La API depende de que ese contenedor termine con éxito (`SUCCESS`), y web espera la salud de la API.

`prisma migrate deploy` aplica las migraciones pendientes que estén versionadas en `prisma/migrations/`; editar únicamente `prisma/schema.prisma` no cambia la base de datos. Crear y revisar la migración, incluirla en el commit y desplegarla junto con la versión de la aplicación. El contenedor de migración se ejecuta al iniciar una tarea nueva; si no hay migraciones pendientes, un despliegue de sólo código no modifica el esquema.

Las migraciones deben ser compatibles con la versión anterior de la aplicación mientras ECS reemplaza tareas. Para cambios incompatibles, usar una secuencia expand/contract en despliegues separados. Si la migración falla, la API no inicia; el rollback de ECS no revierte automáticamente cambios ya aplicados en la base de datos.

### Ejecución manual fuera del flujo CDK

Para un entorno que no use el contenedor de migración de CDK, el script manual es:

```bash
./infra/scripts/migrate.sh
```

No ejecutar este paso como si fuera un paso previo independiente del workflow CDK: en staging las migraciones y el seed corren dentro de la tarea ECS.

1. **Despliegue de versión:** actualización de las imágenes y del task definition mediante el mecanismo propio del entorno.
2. **Smoke Tests Automáticos:**
   ```bash
   TARGET_URL="http://<ipv4-publica-actual>" ./infra/scripts/smoke-test.sh
   ```
   El script verifica automáticamente liveness (`/health/live`), readiness (`/health/ready`), métricas (`/metrics`) y documentación OpenAPI.
3. **Procedimiento de Rollback:** En caso de fallo crítico detectado en smoke tests o métricas, se revierte el contenedor a la versión de imagen previa y se restaura el respaldo de base de datos previo mediante `infra/scripts/restore.sh`.

## 5. Diseño de staging e inventario histórico

La configuración CDK y el inventario histórico de esta sección no representan recursos actualmente activos. AWS staging está eliminado/no desplegado desde la verificación del 2026-10-09; producción tampoco está desplegada. No asumir que el workflow está habilitado: el valor de `AWS_STAGING_READY` no se verificó.

### Último inventario histórico conocido (2026-10-05; no representa el estado actual)

| Componente      | Última observación histórica (2026-10-05)                          |
| --------------- | ----------------------------------------------------------------- |
| Cuenta y región | `075566976700`, `us-east-2`                                       |
| CloudFormation  | Los stacks estaban activos en la fecha indicada; ahora eliminados |
| Cómputo         | Un host EC2 `t3.small`, instancia `i-05dab87f12229d17c`           |
| Acceso          | `http://18.222.63.51`, IPv4 efímera en esa fecha                  |
| ECS             | Cluster `puk-staging`, servicio y tarea de API/web ejecutándose   |
| Persistencia    | RDS separado del host; secreto runtime existente en esa fecha     |
| Archivos        | Google Drive es el único proveedor de archivos de la aplicación    |
| Recursos de red | Sin ALB ni NAT Gateway en el inventario regional consultado       |

En la consulta del 2026-10-05, el bucket `EvidenceBucket` seguía existiendo y la aplicación desplegada
lo referenciaba; devolvió cero versiones y marcadores de borrado. Es sólo una observación histórica,
no evidencia del estado actual ni autorización para borrar recursos. No se ha comprobado ni declarado
pérdida de datos de RDS o de archivos históricos.

La IaC local describe un host público `t3.small`, tarea ECS en modo `bridge`, migración/seed antes de
API y web después de su health check. No declara ALB, CloudFront, NAT Gateway ni Elastic IP. RDS
queda privado; los detalles están en [Infraestructura y operación](./technical/infrastructure-and-operations.md).

Los valores de acceso de los inventarios históricos son sólo referencias de pruebas y no implican
que exista un endpoint activo. No ingresar datos reales ni información de producción en un futuro
staging sin TLS.

### Configuración de Sheets, Drive y Gmail para un futuro despliegue

Para un futuro despliegue, los valores de Google se almacenarían en AWS Secrets Manager; el secreto
de staging anterior ya no está disponible. No se almacenan como variables de GitHub Actions ni en
el repositorio. La configuración local de referencia está en `.env.example`; no contiene valores reales.

| Campo del secreto runtime           | Uso / origen                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `GOOGLE_SPREADSHEET_ID`             | Documento de pruebas para clientes y equipos                 |
| `GOOGLE_TECHNICIANS_SPREADSHEET_ID` | Documento de pruebas para directorio y reportes técnicos     |
| `GOOGLE_CLIENT_EMAIL`               | `client_email` del JSON de la cuenta de servicio de Sheets   |
| `GOOGLE_PRIVATE_KEY`                | `private_key` del mismo JSON                                 |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID`      | ID de la raíz de la unidad compartida de pruebas             |
| `GOOGLE_DRIVE_CLIENT_EMAIL`         | `client_email` del JSON de la cuenta de servicio de Drive    |
| `GOOGLE_DRIVE_PRIVATE_KEY`          | `private_key` del mismo JSON de Drive                        |
| `GOOGLE_GMAIL_CLIENT_EMAIL`         | `client_email` de la cuenta de servicio con delegación Gmail |
| `GOOGLE_GMAIL_PRIVATE_KEY`          | `private_key` del mismo JSON de la cuenta Gmail              |
| `GOOGLE_GMAIL_SENDER_EMAIL`         | Buzón Workspace suplantado y encabezado `From`               |

**Gmail no está conectado al task definition de CDK.** `ApplicationStack` inyecta credenciales
de Sheets y Drive, pero no `GOOGLE_GMAIL_*`; configurar esos valores en Secrets Manager no basta
para habilitar envíos en AWS. Se requiere primero mapearlos en IaC/tarea y desplegar. En ejecución
local, el envío manual funciona con las tres variables, delegación de dominio autorizada y API
reiniciada al cambiar el remitente. El superadministrador de Workspace debe autorizar el scope
`https://www.googleapis.com/auth/gmail.send`. La identidad de Gmail separada es recomendada, pero
la aplicación permite reutilizar la identidad de Sheets/Drive. El envío es manual; no se envía al
completar órdenes automáticamente. Ver [entrega de reportes por correo](./report-email-delivery.md).

Para un documento de Sheets con URL `https://docs.google.com/spreadsheets/d/<ID>/edit`, usar el
segmento `<ID>`, no el `gid` de una pestaña. Véase [operaciones de Sheets](https://developers.google.com/workspace/sheets/api/samples/sheet).
Para Drive, abrir **Unidades compartidas**, entrar a la **raíz** de la unidad de pruebas y tomar el
ID de `https://drive.google.com/drive/folders/<ID>`. No usar el ID de una subcarpeta ni una carpeta
compartida de **Mi unidad**; confirmar que el ID corresponda a la unidad mediante Drive API antes
de desplegar. [Obtener el ID desde la raíz](https://support.google.com/workspacemigrate/answer/9991830?hl=en).

Las pestañas de clientes/equipos están configuradas en `infra/cdk/lib/application-stack.ts` como
`Clientes` y `SALIDAS`. La API usa por defecto `DIRECTORIO TECNICO` y `2026` para técnicos y
reportes; sus variables son `GOOGLE_TECHNICIANS_SHEET_NAME` y
`GOOGLE_TECHNICIAN_REPORT_SHEET_NAME`. Cambiar nombres de pestañas requiere ajustar la
configuración del task definition y desplegar, no sólo cambiar un ID de documento.

### Declarar una nueva cuenta de servicio de pruebas

1. Seleccionar un proyecto de Google Cloud dedicado a pruebas y habilitar **Google Sheets API** y
   **Google Drive API** en **APIs y servicios → Biblioteca**. Si se usan proyectos separados,
   habilitar la API correspondiente en cada uno. [Habilitar APIs](https://developers.google.com/workspace/guides/enable-apis).
2. En **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**, crear la identidad
   de pruebas. Se pueden usar identidades separadas para Sheets y Drive; no reutilizarlas de forma
   automática. Los permisos IAM del proyecto no dan acceso a documentos de Workspace y no se
   necesita delegación de todo el dominio para estos archivos compartidos explícitamente.
   [Crear credenciales](https://developers.google.com/workspace/guides/create-credentials).
3. Abrir la cuenta → **Claves → Agregar clave → Crear nueva clave → JSON**. Descargar el archivo
   fuera del repositorio y protegerlo con permisos restrictivos. No pegar su contenido en chat,
   logs, tickets ni commits. Si la organización impide crear claves, solicitar el mecanismo
   aprobado; no desactivar esa política para continuar.
   [Crear claves JSON](https://docs.cloud.google.com/iam/docs/keys-create-delete?hl=en).
4. Crear o copiar documentos **exclusivos de pruebas**, conservar sus pestañas y encabezados y
   eliminar datos reales. Compartir ambos Sheets directamente con el correo de su cuenta de
   servicio como **Editor**, porque la integración también escribe asignaciones y reportes.
   [Compartir con cuentas de servicio](https://developers.google.com/workspace/guides/create-credentials).
5. Crear una **unidad compartida real de Google Workspace**, dedicada a pruebas; en **Administrar
   miembros**, añadir el correo de la cuenta de Drive como **Colaborador / Contributor**
   (`writer`), suficiente para las operaciones actuales de lectura y creación. No conceder
   Administrador por defecto; ampliar permisos sólo si una operación futura lo requiere. Las
   políticas de Workspace deben permitir esa membresía. Una carpeta compartida de Mi unidad no
   sustituye una unidad compartida: las cuentas de servicio no tienen cuota ni pueden ser
   propietarias de archivos. [Unidades compartidas](https://developers.google.com/workspace/drive/api/guides/about-shareddrives),
   [roles de Drive](https://developers.google.com/workspace/drive/api/guides/ref-roles).
6. Mediante la consola de Secrets Manager, abrir **Recuperar valor del secreto → Editar** y agregar
   o modificar **únicamente** los campos de Google de la tabla. Mantener intactos `JWT_*`,
   `SEED_*` y cualquier otro campo existente. Guardar sin copiar ni imprimir el JSON completo.
   Esta operación humana no requiere enviar claves al agente.

> **No usar `configure-staging-secrets.mjs --overwrite` para cambiar IDs o cuentas de servicio.**
> Es un reemplazo completo: genera nuevas claves JWT y nuevas contraseñas de los dos administradores
> del seed. Puede invalidar sesiones y desalinear las contraseñas guardadas con usuarios existentes.
> Sin `--overwrite`, el script sólo sirve para crear un secreto que aún no existe y rechaza el actual.

### Validar y sincronizar antes de limpiar

**El despliegue de Drive está pendiente de configuración segura y validación de Google.** No usar
IDs ficticios ni recursos de producción para superar esta condición.

1. Confirmar que ambos Sheets y la unidad compartida son de pruebas. Con sus identidades de
   servicio, verificar lectura de las pestañas esperadas y lectura de metadatos de la unidad
   mediante un mecanismo seguro que no imprima claves ni contenido de documentos.
2. Ejecutar `pnpm infra:test`, `pnpm --filter @puk/infra typecheck` y `pnpm infra:synth`.
   Revisar `pnpm infra:diff` con acceso AWS autorizado. Preservar los exports de Foundation que
   todavía consume Application: primero actualizar el consumidor, luego retirar exports o recursos
   de red sin uso. No desplegar Foundation primero
   si intenta eliminar un export aún consumido. No reemplazar RDS, VPC ni secretos por accidente.
3. Con todos los campos de Drive presentes y requisitos cumplidos, desplegar **sólo Application**
   desde `infra/cdk`, sin actualizar dependencias automáticamente:

   ```bash
   pnpm exec cdk deploy PukStagingApplication --exclusively --app 'node --import tsx bin/puk.ts'
   ```

   No empezar con `pnpm infra:deploy` / `deploy --all` sin revisar el diff de Foundation y sus
   consumidores. Actualizar Foundation después de liberar imports y validar la aplicación.
   Guardar una nueva versión del secreto no cambia contenedores existentes: para cambios sólo
   de secretos, usar **Force new deployment** en el servicio del cluster ECS `puk-staging`; el task
   definition requiere las credenciales de Drive para habilitar las funciones de archivos.

4. Ejecutar el smoke test y una prueba funcional controlada de carga/lectura de un archivo
   sintético en Drive y escritura de una fila de pruebas en Sheets. `/health/ready` sólo comprueba
   PostgreSQL; un smoke test verde **no verifica** autenticación o permisos de Google.
5. Sólo después de validar la transición, retirar permisos y recursos obsoletos que no tengan
   consumidores. Los recursos y archivos remotos no fueron inspeccionados ni eliminados como parte
   de este cambio local. Conservar datos, RDS y secretos; eliminar la integración del código no
   elimina archivos remotos existentes.

El workflow `.github/workflows/deploy-staging.yml` se ejecuta después de CI exitoso sobre `main`
sólo si `AWS_STAGING_READY` vale exactamente `true`. Su valor actual no se verificó ni modificó.
No habilitar despliegue automático hasta resolver la configuración de Google y el cambio de
exports entre stacks. GitHub Actions utiliza OIDC y el rol `puk-staging-github-deploy`.

### Consultar la IP y diagnosticar

La IP del inventario es una referencia temporal. Consultar su valor actual antes de operar:

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

Diagnóstico de sólo lectura con sesión y destino autorizados; no imprimir secretos ni copiar logs
que contengan información sensible:

```bash
aws cloudformation describe-stacks --region us-east-2 --stack-name PukStagingApplication
aws ecs describe-services --region us-east-2 --cluster puk-staging --services <service-name>
aws ecs list-tasks --region us-east-2 --cluster puk-staging --service-name <service-name>
aws logs tail /puk/staging/migration --region us-east-2 --since 30m
aws logs tail /puk/staging/api --region us-east-2 --since 30m
TARGET_URL="http://<ipv4-publica-actual>" ./infra/scripts/smoke-test.sh
```

El smoke test comprueba `/health/live`, `/health/ready`, `/metrics` y `/docs/`. Si falla una
migración, la API no inicia: conservar los logs y evaluar la migración antes de reintentar.
El circuit breaker de ECS puede revertir la revisión de aplicación; no restaura automáticamente
la base de datos. Para restauraciones, usar sólo un respaldo verificado y aprobación operativa.

Los assets de CI corresponden a `workflow_run.head_sha`. En despliegues manuales, registrar el SHA,
la revisión de ECS, los cambios locales incluidos y el operador. Un solo host y despliegues
stop-before-start (0 % mínimo, 100 % máximo) implican una interrupción durante cada actualización.

### Costos y limpieza

RDS, EC2, EBS, la IPv4 pública y los servicios asociados pueden generar costos aunque no haya
tráfico. No hay ALB ni NAT Gateway en el inventario regional consultado. No eliminar recursos
por nombre o por ausencia de tráfico: comprobar stack propietario, dependencias y datos primero.
`RETAIN` y protección contra borrado no sustituyen un respaldo verificado.
