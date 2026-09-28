---
marp: true
theme: default
paginate: true
header: 'Bull Dog Solution — Manual de Usuario y Presentación Operativa'
footer: 'Versión 1.0 | Sistema de Órdenes de Servicio'
style: |
  section {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    padding: 40px;
    font-size: 1.25rem;
  }
  h1 {
    color: #1e3a8a;
  }
  h2 {
    color: #2563eb;
  }
  .highlight {
    background-color: #fef08a;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: bold;
  }
  .badge-admin { background: #dbeafe; color: #1e40af; }
  .badge-tech { background: #dcfce7; color: #166534; }
  .badge-error { background: #fee2e2; color: #991b1b; }

  .flow-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 18px 0;
  }
  .flow-card {
    background: #f8fafc;
    border: 2px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 6px;
    text-align: center;
    font-size: 0.88rem;
    line-height: 1.25;
  }
  .flow-card.admin {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1e40af;
  }
  .flow-card.tech {
    border-color: #86efac;
    background: #f0fdf4;
    color: #166534;
  }
  .flow-card.final {
    border-color: #fde047;
    background: #fefce8;
    color: #854d0e;
    font-weight: bold;
  }
  .flow-alt {
    background: #fef2f2;
    border-left: 4px solid #ef4444;
    padding: 8px 12px;
    font-size: 0.9rem;
    margin: 12px 0;
    color: #991b1b;
  }
  .step-num {
    display: inline-block;
    width: 22px;
    height: 22px;
    line-height: 22px;
    border-radius: 50%;
    background: rgba(0,0,0,0.1);
    font-size: 0.75rem;
    font-weight: bold;
    margin-bottom: 4px;
  }
---

# Bull Dog Solution

## Sistema de Gestión de Órdenes de Servicio

### Manual de Usuario y Guía Operativa Paso a Paso

> Este documento sirve como **presentación interactiva** (compatible con Marp / Slides) y **manual de usuario vivo** para el equipo administrativo y técnico. Actualízalo conforme se integren nuevas características (_features_).

---

## Índice General

1. [Visión General y Propósito](#3)
2. [Arquitectura y Roles del Sistema](#4)
3. [Flujo General del Servicio](#5)
4. [Módulo Administrador: Preparación y Asignación](#6)
5. [Módulo Técnico: Operación en Campo (Mobile First)](#10)
6. [Reglas del Checklist y Evidencias Fotográficas](#12)
7. [Manejo de Discrepancias y Citas Fallidas](#14)
8. [Módulo de Reportes y Descarga de Actas](#16)
9. [Sincronización con Google Sheets y Resiliencia](#18)
10. [Preguntas Frecuentes y Resolución de Problemas](#19)
11. [Registro de Nuevas Funcionalidades (Changelog)](#20)

---

## 1. Visión General y Propósito

El sistema sustituye la operativa manual y las limitaciones de AppSheet por una plataforma web moderna, rápida y trazable.

- **Para la Oficina (Administradores):**
  - Control centralizado de órdenes, clientes, unidades y asignación de técnicos.
  - Conexión directa con Google Sheets para catálogos oficiales sin duplicidad.
  - Auditoría de estados y exportación de reportes ejecutivos.

- **Para el Campo (Técnicos):**
  - Aplicación web optimizada para teléfonos móviles (PWA).
  - Verificación ágil de equipos telemáticos (GPS / Sensores).
  - Checklist digital obligatorio con fotografías y firma del cliente en pantalla.
  - Capacidad de reportar discrepancias sin detener el trabajo.

---

## 2. Arquitectura y Roles del Sistema

El sistema maneja dos perfiles de usuario claramente delimitados:

| Rol                                                  | Entorno Principal             | Responsabilidades Clave                                                                                                                                                                                                                         |
| :--------------------------------------------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <span class="badge badge-admin">ADMINISTRADOR</span> | Web Desktop (Computadora)     | • Crea órdenes en borrador.<br>• Consulta clientes y equipos de Sheets.<br>• Asigna y reasigna técnicos.<br>• Consulta auditoría, reportes y supervisa sincronizaciones.                                                                        |
| <span class="badge badge-tech">TÉCNICO</span>        | Web Mobile / PWA (Smartphone) | • Consulta órdenes asignadas a su nombre.<br>• Inicia el servicio en la unidad vehicular.<br>• Valida IMEI/series y levanta discrepancias.<br>• Llena checklist con fotos obligatorias.<br>• Recoge firma digital del cliente y finaliza orden. |

---

## 3. Flujo General del Servicio

<div class="flow-grid">
  <div class="flow-card admin"><span class="step-num">1</span><br><b>Admin</b> crea Borrador</div>
  <div class="flow-card admin"><span class="step-num">2</span><br>Asigna Unidades y Equipos</div>
  <div class="flow-card admin"><span class="step-num">3</span><br>Asigna Técnico Responsable</div>
  <div class="flow-card tech"><span class="step-num">4</span><br><b>Técnico</b> inicia Servicio</div>
  <div class="flow-card tech"><span class="step-num">5</span><br>Valida Hardware e IMEI</div>
  <div class="flow-card tech"><span class="step-num">6</span><br>Checklist + mínimo 10 fotos por unidad</div>
  <div class="flow-card tech"><span class="step-num">7</span><br>Firma Digital Cliente</div>
  <div class="flow-card final"><span class="step-num">8</span><br>Cierre y Reporte PDF</div>
</div>

<div class="flow-alt">
  <b>Ruta de Excepción:</b> En caso de unidad ausente o cliente no disponible ➔ 
  <span class="badge badge-error">Cierre como Cita Fallida (con motivo)</span>
</div>

> **Regla de oro:** El técnico no puede cerrar un servicio normal si una unidad tiene menos de diez fotografías, si alguna unidad no tiene su checklist completo o si falta la firma con nombre del cliente.

---

## 4. Guía Administrador: 1. Crear Orden (Asistente de 5 Pasos)

1. Inicia sesión con tus credenciales de Administrador en el portal web.
2. Dirígete a la sección **Órdenes de Servicio** y haz clic en **`+ Nueva Orden`**.
3. **Paso 1: Cliente**:
   - Selecciona el **Cliente** (catálogo oficial de Google Sheets).
4. **Paso 2: Servicios, Unidades y Equipos (Asignación Inteligente)**:
   - Agrega uno o varios bloques de servicio; una misma orden puede combinar:
     - `Instalación`: Colocación de nuevos equipos en vehículos.
     - `Revisión`: Diagnóstico, mantenimiento o inspección técnica de equipos ya instalados.
     - `Desinstalación`: Retiro de hardware instalado en la unidad.
     - `Sensor fuel`: Instalación de un equipo disponible en una unidad.
     - `Cambio de equipo`: Retiro del equipo instalado y colocación de uno nuevo.
   - **En Revisiones y Desinstalaciones**:
     - El selector de equipos solo muestra los GPS con estatus **`INSTALADO`** que pertenecen al cliente seleccionado.
     - Al elegir un equipo, el sistema **autocompleta automáticamente** los datos de la unidad desde Google Sheets (`Económico`, `Marca/Modelo`, `Año` y `Número de Serie`), evitando capturas manuales innecesarias. El administrador puede revisar o afinar estos datos en pantalla.
   - **En Instalaciones y Sensor fuel**:
     - El selector filtra **únicamente equipos en almacén/stock disponible**.
     - Se capturan los datos del vehículo donde se montará el nuevo equipo (Económico, Marca/Modelo, Año y Número de Serie/VIN).
   - **En Cambios de equipo**:
     - Selecciona primero el equipo `INSTALADO` del cliente que será retirado.
     - Selecciona después el equipo disponible de almacén que lo reemplazará. La unidad se autocompleta a partir del equipo anterior.
   - Permite agregar una o varias unidades/equipos según la flotilla a atender en la cita.
5. **Paso 3: Programación**:
   - Fecha y hora programada para la cita.
   - Indicador de servicio a domicilio / en sitio con captura de dirección física.
   - Notas generales e instrucciones para el técnico.
6. **Paso 4: Técnico Asignado**:
   - Selecciona obligatoriamente un técnico activo sincronizado desde `DIRECTORIO TECNICO`.
   - Puedes filtrar por ciudad o taller y buscar por nombre, taller o ciudad. La ficha muestra clave externa, ubicación y teléfono cuando están disponibles.
   - Si el directorio falla, pulsa **Reintentar**. Si está vacío, usa **Recargar directorio**. No podrás continuar hasta elegir un técnico disponible.
7. **Paso 5: Resumen y Confirmación**:
   - Revisa el resumen integral agrupado por servicio, con cliente, vehículos y hardware asignado.
   - Al pulsar **`Crear Orden de Servicio`**, el sistema genera un **Folio único**, crea las unidades y vincula los equipos atómicamente en estado **`DRAFT` (Borrador)**.

---

## 4. Guía Administrador: 2. Gestión de Unidades y Equipos en Detalle

Si requieres agregar o ajustar unidades y equipos posteriormente, puedes hacerlo desde el detalle de la orden:

1. Dentro de la orden en borrador, puedes agregar unidades adicionales o asociarles equipo mediante el selector [`EquipmentSelect`].
2. El selector mantiene las mismas reglas de negocio: muestra equipos disponibles para instalaciones y sensor fuel; instalados del cliente para revisiones y desinstalaciones; y ambos grupos para un cambio de equipo.
3. Las comparaciones de cliente aplican **normalización inteligente**: ignoran mayúsculas/minúsculas, acentos, espacios múltiples y variaciones de sufijos legales (ej. `"Transportes Bull Dog"` vs `"TRANSPORTES BULL DOG S.A. DE C.V."`), previniendo falsos conflictos.

---

## 4. Guía Administrador: 3. Asignación del Técnico y Sincronización

1. Con las unidades y equipos listos, selecciona el **Técnico Responsable** (obligatorio antes de confirmar).
2. Haz clic en el botón **`Asignar y Notificar`**:
   - El sistema realiza una revalidación fresca contra Google Sheets.
   - Si el equipo ya pertenece al cliente (incluso con diferencias de mayúsculas o sufijos), la verificación es exitosa.
   - La orden cambia a estado **`ASSIGNED`**.
   - La transacción crea operaciones Outbox y el worker actualiza en segundo plano las columnas autorizadas (`J`, `K`, `L`, `M`, `N`, `O`) en Google Sheets.
   - La orden aparece de inmediato en la bandeja de trabajo del técnico en su dispositivo móvil.

---

## 4. Guía Administrador: 4. Monitoreo y Estados

Desde la tabla principal de órdenes puedes filtrar por estado:

- `DRAFT`: En preparación por el administrador.
- `ASSIGNED`: Lista para que el técnico acuda a la cita.
- `IN_PROGRESS`: El técnico presionó "Iniciar Servicio" en campo.
- `COMPLETED`: Servicio concluido con checklist, fotos y firma.
- `REQUIRES_CORRECTION`: Observada por administración para revisión.
- `FAILED_APPOINTMENT`: Cita no realizada (con motivo registrado).
- `CANCELLED`: Cancelada antes de su ejecución.

---

## 5. Guía Técnico: 1. Bandeja Móvil

1. Accede desde el navegador de tu celular al enlace de la aplicación (puedes agregarla a la pantalla de inicio como PWA).
2. Ingresa con tu correo y contraseña de técnico.
3. En la pantalla principal verás tu lista de **Servicios Asignados**:
   - Verás el folio, cliente, dirección o taller, y número de unidades.
4. Al llegar a la ubicación del vehículo, presiona la orden y pulsa el botón verde **`Iniciar Servicio`**:
   - El estado de la orden pasa a `IN_PROGRESS` registrando la hora de inicio.

---

## 5. Guía Técnico: 2. Verificación de Equipos

Por cada unidad asignada, debes inspeccionar físicamente el hardware:

1. Selecciona la unidad y entra a la sección **Equipos Asignados**.
2. Compara el IMEI y el Número de Serie físico contra lo indicado en la pantalla.
3. Si los datos coinciden exactamente, pulsa **`Verificar (Coincide)`**.
4. **¿Qué hacer si hay un error o el equipo es diferente?**
   - Pulsa **`Reportar Discrepancia`**.
   - Escribe el IMEI o serie real que tienes en mano y una breve nota.
   - El equipo se marca con alerta visual, pero **te permite continuar trabajando**. ¡No te bloquea el servicio!

---

## 6. Reglas del Checklist Post-Servicio

Al terminar los trabajos mecánicos/eléctricos, debes realizar la inspección de entrega en cada unidad. Existen **5 categorías obligatorias**:

1. **Tablero (`DASHBOARD`)**
2. **Cristales (`WINDOWS`)**
3. **Accesorios (`ACCESSORIES`)**
4. **Molduras (`TRIMS`)**
5. **Carrocería (`BODYWORK`)**

### Estados permitidos por categoría:

- **`Bien` (`GOOD`)**: Todo en orden sin daños causados ni preexistentes.
- **`Mal` (`BAD`)**: **Requiere escribir obligatoriamente una observación detallada** del daño o anomalía.
- **`No aplica` (`NOT_APPLICABLE`)**: La unidad no cuenta con dicho componente.

---

## 6. Reglas de Evidencias Fotográficas

> ⚠️ **REGLA ESTRICTA DE CALIDAD:**  
> **Cada unidad requiere al menos diez fotografías completadas**, distribuidas entre las categorías del checklist.

1. Pulsa sobre el icono de cámara en la categoría correspondiente.
2. Toma una foto clara y bien iluminada desde tu teléfono.
3. La foto se carga automáticamente al almacenamiento privado mediante la aplicación.
4. El sistema mostrará una miniatura con confirmación verde.
5. Si alguna unidad no tiene las diez fotos requeridas, la aplicación indicará el requisito pendiente y no permitirá finalizar.

---

## 7. Firma del Cliente y Finalización

Cuando todas las unidades tengan sus equipos verificados y sus checklists completos con fotos:

1. Se habilitará el paso final: **`Conformidad del Cliente`**.
2. Ingresa el **Nombre Completo** de la persona que recibe el servicio.
3. Opcionalmente registra su cargo o documento de identidad.
4. Pídele al cliente que firme directamente en la pantalla de tu celular en el recuadro táctil.
5. En la sección **`Notas de ejecución`**, agrega las observaciones generales del servicio si aplica.
   Puedes guardarlas antes de finalizar; si quedan cambios pendientes, el sistema las guarda
   automáticamente al solicitar el cierre. Estas notas pertenecen a toda la orden, no a una unidad
   específica.
6. Pulsa **`Finalizar Orden de Servicio`**:
   - La orden pasa a **`COMPLETED`**.
   - Se sella la fecha y hora final.
   - El sistema genera el acta técnica digital con validez de entrega.
   - Se encolan el reporte técnico y el estado final de cada equipo en `SALIDAS`. En desinstalaciones y equipos retirados se limpian cliente y vehículo; en instalaciones se registra el nuevo vínculo.

---

## 7. Manejo de Citas Fallidas

Si acudes al lugar pero el servicio no se puede realizar (cliente ausente, unidad en viaje, vehículo descompuesto, negativa de acceso):

1. En la pantalla de la orden iniciada, selecciona el botón **`Registrar Cita Fallida`**.
2. Selecciona o escribe el **Motivo Detallado de la Falla** (obligatorio).
3. Confirma la acción:
   - La orden pasa al estado **`FAILED_APPOINTMENT`**.
   - No se exige checklist, fotografías ni firma del cliente.
   - El administrador y el área de logística reciben la notificación para reprogramación o cobro de visita técnica.

El administrador puede resolverla desde el detalle de la orden:

- **Reprogramar:** solicita la nueva fecha y crea una copia enlazada en estado `DRAFT`. La orden
  fallida original conserva su motivo, cobro, reporte e historial.
- **Cancelar servicio:** cierra administrativamente la cita fallida sin borrar el registro ni el
  cobro de la visita realizada.

---

## 8. Módulo de Reportes: Actas en PDF

Para cada orden completada, el sistema genera automáticamente un **Acta / Certificado de Servicio**:

- **¿Dónde consultarlo?**  
  Tanto el administrador como el cliente pueden descargar el PDF desde el detalle de la orden.
- **¿Qué incluye el documento?**
  - Folio y logotipo oficial de Bull Dog Solution.
  - Tiempos de atención (inicio y término).
  - Datos de unidades y tabla de hardware verificado con notas de discrepancias.
  - Tabla del checklist vehicular (Bien / Mal / Observaciones).
  - Galería de fotografías incrustadas con marca de fecha y hora.
  - Firma digitalizada y nombre del cliente firmante.

---

## 8. Módulo de Reportes Ejecutivos y Exportación

Desde el menú **Reportes** (perfil Administrador), se cuenta con las siguientes opciones de exportación:

1. **Reporte Consolidado de Órdenes:** Exportación a Excel (XLSX) y CSV con filtros por rango de fechas, clientes y tipo de servicio.
2. **Reporte de Discrepancias:** Listado de todos los equipos con diferencias de IMEI/Serie reportados en campo para ajuste de inventario.
3. **Métricas de Técnicos:** Tasa de servicios completados, tiempos promedio por servicio y efectividad de visitas.
4. **Reporte de Citas Fallidas:** Resumen de causas recurrentes de no atención.
5. **Auditoría:** Registro de quién modificó o reasignó cada orden y cuándo.

---

## 9. Sincronización con Google Sheets y Resiliencia

El sistema está diseñado para que una falla en Internet o en las cuotas de Google no detenga la operación:

- **Patrón Outbox:**  
  Cuando se asigna un equipo o se actualiza una orden, la acción se guarda primero en la base de datos PostgreSQL y un worker la envía a Google Sheets en segundo plano.
- **Reintentos Automáticos:**  
  Si Google Sheets no responde, el sistema reintenta periódicamente sin perder información.
- **Monitor de Sincronización:**  
  Los administradores cuentan con la sección **Sincronización**, donde pueden ver reportes programados, procesando, sincronizados o fallidos y ejecutar **Sincronizar ahora** cuando corresponda.
- **Corte semanal del reporte técnico:**
  La configuración inicial acepta órdenes cerradas hasta el martes a las 23:59:59 y publica el lote el miércoles a las 17:00, usando `America/Hermosillo`. El administrador puede cambiar el día de corte, el día de envío, la hora y la zona horaria. Las órdenes cerradas después del corte se publican en la ventana de la semana siguiente.
- **Diferencia entre órdenes y operaciones:**
  El resumen muestra por defecto solo el reporte técnico. El filtro **Equipos** muestra las actualizaciones internas de `SALIDAS`; una orden con varios equipos genera varias operaciones, pero no varias filas del reporte técnico. Los intentos se muestran dentro de cada operación y no se cuentan como órdenes nuevas.
- **Correcciones:**
  Si una corrección crea una versión nueva antes de la publicación, la versión pendiente anterior queda como `SUSTITUIDA`. Los fallos ocurridos al publicar se reintentan con backoff sin esperar hasta la siguiente semana.

---

## 10. Preguntas Frecuentes y Resolución de Problemas

- **¿Qué hago si no hay señal celular en el taller?**  
  Toma las fotos con tu cámara nativa; en cuanto tengas conexión móvil o Wi-Fi, abre la orden para completar el checklist y subir las evidencias.
- **¿Puedo cambiar de técnico una orden ya asignada?**  
  Sí, el administrador puede reasignarla desde el panel web mientras la orden no haya sido finalizada.
- **¿Por qué no se habilita el botón de finalizar orden?**  
  Verifica que: (1) Todas las unidades tengan checklist completo, (2) Cada unidad tenga al menos diez fotos, (3) Todos los equipos estén verificados o con discrepancia reportada, y (4) Se haya ingresado el nombre y firma del cliente.

---

## 11. Registro de Nuevas Funcionalidades (Changelog)

> _Utiliza esta sección para registrar los cambios que se agreguen a la aplicación en fases posteriores._

| Fecha          | Versión  | Tipo        | Descripción del Cambio / Nueva Feature                                                                                              | Responsable |
| :------------- | :------- | :---------- | :---------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| **2026-09-02** | `v1.0.0` | Lanzamiento | MVP del Sistema: Órdenes, Checklist 5 categorías, Fotos S3, Firma Canvas, Reportes PDF/Excel y Sincronización Sheets.               | Equipo Core |
| **2026-09-11** | `v1.1.0` | Mejora      | Corte y envío semanal configurables para el reporte técnico, tablero global y reintento inmediato por operación.                    | Equipo Core |
| **2026-09-10** | `v1.1.0` | Feature     | Órdenes multiservicio, directorio técnico sincronizado, tarifas por servicio, reporte de cobro y actualización final de inventario. | Equipo Core |
| _Próximamente_ | `v1.2.0` | Feature     | Modo offline progresivo con persistencia local en dispositivo móvil.                                                                | Por definir |
| _Próximamente_ | `v1.3.0` | Feature     | Envío automático de Acta de Servicio por correo electrónico al cliente al finalizar.                                                | Por definir |

---

# ¿Preguntas o Soporte Técnico?

Para reportar fallas en el sistema o sugerir mejoras:

- **Área de Operaciones:** operaciones@bulldogsolution.com
- **Soporte de Plataforma:** soporte-ti@bulldogsolution.com
- **Repositorio y Documentación Técnica:** [SPECS.md](./SPECS.md) | [ERS.md](./docs/ERS.md)
