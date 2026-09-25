# Riesgos y controles al usar servicios externos

**Proyecto:** Bull Dog Solution — Sistema de órdenes de servicio  
**Servicio analizado:** Google Sheets  
**Objetivo:** documentar los riesgos reales de depender de un servicio externo sin presentarlo como una mala solución por sí misma.

## Resumen ejecutivo

Google Sheets puede ser una solución práctica para compartir catálogos, directorios y reportes con equipos que ya trabajan allí. El problema no es usarlo, sino tratarlo como si tuviera las mismas garantías que una base de datos transaccional.

En PUK, Sheets debe considerarse una **dependencia externa y una superficie de intercambio**, no el único lugar donde vive el estado crítico del negocio. Si el servicio está caído, cambia su estructura o alguien edita datos manualmente, la aplicación debe poder detectar la situación, conservar la operación local y dejar la sincronización pendiente para resolverla después.

## Riesgos principales

| Riesgo | Qué puede pasar | Impacto | Controles recomendados |
| --- | --- | --- | --- |
| Disponibilidad, red y cuotas | Google Sheets, la red o la API pueden no responder, responder lento o limitar solicitudes. | Una consulta puede fallar y una sincronización puede quedar pendiente. | Timeout, reintentos acotados, estado `pending/failed`, reintento manual y alertas por antigüedad. |
| Datos desactualizados | Una hoja puede mostrar información anterior mientras otra operación todavía no se sincronizó. | Un usuario puede tomar decisiones con datos que ya cambiaron en PUK. | Definir la fuente de verdad, mostrar fecha/estado de última sincronización y evitar prometer tiempo real. |
| Ediciones manuales y cambios de estructura | Alguien puede renombrar una pestaña, mover columnas, cambiar encabezados o pegar valores incompatibles. | La integración puede rechazar la operación o, en el peor caso, interpretar mal los datos. | Contrato de columnas, validación de encabezados, permisos limitados y revisión antes de cambios. |
| Escrituras concurrentes | Dos usuarios o procesos pueden editar la misma fila casi al mismo tiempo. | Puede haber sobrescrituras, conflictos o resultados difíciles de reconstruir. | Identificadores estables, detección de duplicados, verificación posterior y evitar usar Sheets como mecanismo de bloqueo. |
| Escrituras parciales | La API puede aceptar parte de una operación y fallar antes de completarla o antes de que la aplicación reciba la respuesta. | Un reintento ingenuo puede duplicar o volver a modificar información. | Operaciones idempotentes, folios únicos, verificación posterior y conciliación de diferencias. |
| Credenciales y permisos | Una cuenta de servicio comprometida o demasiado amplia puede dar acceso a hojas sensibles. | Exposición o modificación no autorizada de información. | Cuenta dedicada, mínimo privilegio, secretos fuera del repositorio, rotación y auditoría de accesos. |
| Privacidad y gobierno de datos | La información operativa queda duplicada en un proveedor externo y puede compartirse, exportarse o conservarse más tiempo del esperado. | Pérdida de control sobre quién accede a los datos y durante cuánto tiempo. | Clasificar datos, limitar columnas, revisar compartición, definir retención y documentar responsables. |
| Cambios del proveedor | Google puede modificar cuotas, permisos, API o comportamiento de la plataforma. | Una integración que funcionaba puede degradarse sin un cambio en PUK. | Monitoreo, pruebas de contrato, dependencia encapsulada y plan de contingencia. |
| Soporte y diagnóstico | Algunos errores externos son genéricos o difíciles de reproducir localmente. | Aumenta el tiempo para saber si el problema está en PUK, la red, permisos o la hoja. | Correlation ID, logs sin secretos, métricas de latencia/error y runbook operativo. |

## Controles que ya existen en PUK

La integración actual ya reduce parte de estos riesgos:

- Usa timeout para no dejar una solicitud esperando indefinidamente.
- Registra operaciones de sincronización pendientes o fallidas y permite reintentarlas.
- Valida encabezados y estructura esperada de las hojas.
- Detecta folios duplicados antes de completar la sincronización de reportes.
- Verifica la fila después de escribirla.
- Protege columnas no administradas por la integración y comprueba que no hayan sido alteradas accidentalmente.
- Mantiene la integración detrás de un cliente específico, evitando repartir detalles de Google Sheets por todo el dominio.

Estos controles **reducen la probabilidad y el impacto**, pero no convierten una API externa en una transacción distribuida. Siempre puede existir una ventana entre la escritura, la respuesta y la verificación.

## Recomendaciones de operación

1. **Definir una fuente de verdad por dato.** El estado transaccional de órdenes, usuarios y permisos debe mantenerse en la persistencia de PUK; Sheets puede servir como catálogo, directorio o reporte según cada caso.
2. **No bloquear el negocio por una caída de Sheets.** Registrar la operación localmente y sincronizar después es más seguro que perder una orden o impedir su cierre.
3. **Monitorear la salud de la integración.** Como mínimo: última sincronización exitosa, operaciones pendientes, edad de la operación más antigua, tasa de fallos, errores de permisos y errores de cuota.
4. **Mantener un contrato de las hojas.** Documentar pestañas, encabezados, columnas administradas y columnas editables por personas.
5. **Preparar conciliación y recuperación.** Debe existir una forma de comparar PUK contra Sheets, corregir diferencias y saber cuándo no conviene reintentar automáticamente.
6. **Aplicar mínimo privilegio.** La cuenta usada por la API debe acceder únicamente a las hojas necesarias y sus credenciales deben rotarse sin modificar código.
7. **Definir un responsable.** El equipo debe saber quién puede cambiar la estructura, quién revisa fallos y cuándo se debe pausar la sincronización.

## Cuándo dejar de usar Sheets para ese caso

No hace falta retirarlo por defecto. Conviene evaluar otra solución cuando el caso requiera varias escrituras concurrentes, auditoría inmutable, permisos por registro, consistencia inmediata, grandes volúmenes, búsquedas complejas o garantías transaccionales estrictas.

La decisión equilibrada para PUK es conservar Sheets donde aporta valor al flujo operativo, pero mantener una frontera clara: **la aplicación debe tolerar su indisponibilidad, detectar inconsistencias y poder recuperarse sin perder el estado principal**.

## Checklist antes de agregar otra integración externa

- [ ] ¿Qué dato se replica y cuál es su fuente de verdad?
- [ ] ¿Qué ocurre si el proveedor está caído durante una hora?
- [ ] ¿La operación puede reintentarse sin duplicar ni sobrescribir datos válidos?
- [ ] ¿Cómo se detectan cambios manuales o de estructura?
- [ ] ¿Qué información sensible sale de PUK y quién puede verla?
- [ ] ¿Cómo se monitorea, concilia y recupera un fallo?
- [ ] ¿Existe una alternativa temporal o un procedimiento manual?

