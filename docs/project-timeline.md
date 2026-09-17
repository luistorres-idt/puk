# Línea de tiempo del proyecto

Esta línea de tiempo resume la evolución implementada en el repositorio. Las fechas se obtienen del
historial Git; cuando varios commits comparten día se agrupan en una misma fase para que el diagrama
sea legible. El detalle verificable de cada fase conserva sus hashes.

## Diagrama de Gantt

```mermaid
gantt
    title Bull Dog Solution — evolución implementada
    dateFormat  YYYY-MM-DD
    axisFormat  %d %b
    todayMarker stroke-width:2,stroke:#ef4444

    section Fundación
    Monorepo, API base, persistencia y autenticación :done, foundation, 2026-09-02, 1d
    Órdenes, ejecución técnica y reportes PDF          :done, core, 2026-09-02, 1d

    section Documentación e infraestructura
    Documentación técnica, ERS y manual                :done, docs, 2026-09-02, 2026-09-04
    AWS CDK, CI y operación de staging                 :done, infra, 2026-09-07, 1d

    section Calidad del dominio
    SOLID, puertos, circuit breaker y máquina de estados :done, solid, 2026-09-07, 1d
    Pricing, directorio técnico y reporte de Sheets     :done, pricing, 2026-09-09, 1d
    Órdenes multiservicio y sincronización              :done, multiservice, 2026-09-09, 1d

    section Operación y excepciones
    Citas fallidas, reprogramación y reportes           :done, failed, 2026-09-11, 1d

    section Acceso técnico compartido
    Modelo, políticas API y tablero multiorden          :done, shared-api, 2026-09-14, 1d
    Administración de cuentas y reconciliación web      :done, shared-web, 2026-09-14, 1d
    Seguridad viva, read models y límites de módulos    :done, hardening, 2026-09-17, 1d
```

## Fases y commits representativos

| Fecha      | Fase                            | Commits principales                                                         | Resultado                                                                                                 |
| ---------- | ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Fundación del producto          | `cad9005`, `ffc8048`, `19d5b14`, `de75bec`, `d37c5bc`, `d2edb3a`, `4409750` | Monorepo, API, persistencia, autenticación, órdenes, ejecución técnica y reportes PDF.                    |
| 2026-09-04 | Documentación base              | `35886f4`                                                                   | Paquete inicial de documentación técnica.                                                                 |
| 2026-09-07 | Infraestructura y arquitectura  | `3a90b0b`, `7154fad`, `8c93a69`, `62d37e4`, `09624b4`, `c67a47f`            | Staging AWS, CI, operación, SOLID, inversión de dependencias y máquina de estados.                        |
| 2026-09-09 | Dominio multiservicio           | `0e43ed1`–`0239c88`, `d447a9a`, `d6b967a`                                   | Tarifas, snapshots de pricing, directorio técnico, transiciones de equipos y sincronización de reportes.  |
| 2026-09-11 | Excepciones operativas          | `64d77e3`, `ae79473`, `9742216`, `b31bedb`, `871ac21`, `e73f53a`            | Programación de reportes, citas fallidas, reprogramación y reintentos consistentes.                       |
| 2026-09-14 | Acceso compartido               | `5cefdbe`, `1acd4ed`, `39e7b19`, `b65621c`, `34d9cb2`, `7b9a9c3`, `6df839a` | Cuenta técnica compartida, tablero multiorden, permisos y administración de cuentas.                      |
| 2026-09-17 | Endurecimiento y mantenibilidad | `6fb7580`                                                                   | Principal vigente, read models seguros, reconciliación de sesión, límites de módulos y refactor frontend. |

## Hitos actuales

- **Producto funcional:** órdenes administrativas, ejecución móvil, evidencias, firma, reportes y
  sincronización con Sheets.
- **Operación avanzada:** pricing por servicio, citas fallidas y tablero de taller multiorden.
- **Seguridad:** autorización por capacidad y propiedad, principal resuelto en vivo y respuestas
  operativas sin datos administrativos.
- **Calidad:** contratos compartidos, pruebas unitarias/integración/E2E, OpenAPI validado, build y
  auditoría de dependencias de producción sin vulnerabilidades conocidas.

## Criterio de lectura

El Gantt representa días de trabajo observables en Git, no horas exactas de dedicación. Para una
auditoría fina, usar `git log --date=iso` y revisar cada hash listado en la tabla.
