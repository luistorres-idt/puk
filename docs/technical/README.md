# Documentación técnica

**Proyecto:** Bull Dog Solution — Sistema de órdenes de servicio

**Última actualización:** 2026-10-02

**Alcance:** estado implementado en la rama actual

Este directorio describe la arquitectura y operación técnica del sistema. A diferencia de `SPECS.md` y `docs/ERS.md`, que también contienen requisitos y decisiones de producto, estos documentos reflejan los componentes que existen actualmente en el repositorio.

## Contenido

1. [Arquitectura](./architecture.md): contexto, contenedores, componentes, dependencias y decisiones estructurales.
2. [Modelo de datos](./data-model.md): diagrama entidad-relación, agregados, restricciones y estados.
3. [Backend y flujos](./backend-and-flows.md): módulos de API, workers y secuencias críticas.
4. [API HTTP](./api.md): convenciones, autenticación y catálogo de endpoints.
5. [Frontend](./frontend.md): estructura Vue, estado, rutas y flujo de datos.
6. [Infraestructura y operación](./infrastructure-and-operations.md): Docker, configuración, despliegue, observabilidad y comandos.
7. [Seguridad y calidad](./security-and-quality.md): controles implementados y estrategia de pruebas.
8. [Línea de tiempo del proyecto](../project-timeline.md): evolución por fases, fechas y commits.

## Fuentes de verdad

| Tema                     | Fuente principal                                 |
| ------------------------ | ------------------------------------------------ |
| Persistencia             | `prisma/schema.prisma` y `prisma/migrations/`    |
| Contratos de entrada     | `packages/contracts/src/`                        |
| Rutas HTTP               | Routers de `apps/api/src/modules/`               |
| Documento OpenAPI        | `apps/api/src/docs/openapi.ts` y `/docs`         |
| Composición de servicios | `apps/api/src/server.ts` y `apps/api/src/app.ts` |
| Rutas de interfaz        | `apps/web/src/router/` y módulos web             |
| Infraestructura local    | `docker-compose.yml` e `infra/docker/`           |
| Infraestructura AWS      | `infra/cdk/` y `.github/workflows/`              |
| Reglas funcionales       | `SPECS.md`, `docs/ERS.md` y servicios de dominio |

Cuando la documentación y el comportamiento diverjan, el esquema, las migraciones, los contratos y el código ejecutable tienen precedencia. La documentación debe actualizarse en el mismo cambio que modifique esas superficies.
