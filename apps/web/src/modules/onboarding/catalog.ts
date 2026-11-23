import type { SessionUser } from '@puk/contracts';

export interface TourStep {
  target: string;
  title: string;
  description: string;
}

export interface TourContext {
  page: string;
  status: string;
  step: string;
  unit?: string;
}

export interface Tour {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

const step = (target: string, title: string, description: string): TourStep => ({
  target,
  title,
  description,
});

const wizardSteps: Record<string, string> = {
  '1': 'Busca y selecciona al cliente que recibirá el servicio.',
  '2': 'Agrega cada unidad con su servicio y sus equipos. Revisa que no falte ninguna.',
  '3': 'Elige la fecha, la hora y el lugar de la cita. Agrega las indicaciones necesarias.',
  '4': 'Busca y selecciona un técnico activo. La orden necesita un responsable.',
  '5': 'Revisa todos los datos. Crea la orden solo cuando sean correctos.',
};

export function buildTour(user: SessionUser, context: TourContext): Tour {
  const shared = user.orderAccessMode === 'SHARED';
  const admin = !shared && user.role === 'ADMIN';
  const billing = !shared && user.role === 'BILLING';
  const canAccessBilling = admin || billing;
  const audience = shared ? 'shared' : admin ? 'admin' : billing ? 'billing' : 'technician';
  const tour: Tour = {
    id: `${audience}:${context.page}:${context.status}:${context.step}`,
    title: shared
      ? 'Tu tablero de trabajo'
      : admin
        ? 'Tu guía de administración'
        : billing
          ? 'Tu guía de facturación'
          : 'Tu guía de trabajo',
    description: shared
      ? 'Esta cuenta es compartida. Puedes atender órdenes asignadas y activas. No muestra opciones administrativas.'
      : admin
        ? 'Crea la orden, asigna al técnico y revisa el resultado. Esta guía solo explica: no guarda ni cambia datos.'
        : billing
          ? 'Administra facturas, pagos, cuentas de clientes y el corte semanal de reporte técnico. Esta guía no cambia datos.'
          : 'Consulta tus órdenes asignadas y registra el trabajo de cada unidad. Esta guía no cambia datos.',
    steps: [
      step(
        'navigation',
        'Muévete por el sistema',
        'Usa el menú para cambiar de sección. En una pantalla pequeña, ábrelo con el botón de menú.',
      ),
    ],
  };

  if (context.page === 'wizard' && admin) {
    tour.steps = [
      step(
        'wizard-step',
        `Paso ${context.step} de 5`,
        wizardSteps[context.step] ?? 'Completa los campos de este paso.',
      ),
      step(
        'wizard-navigation',
        'Avanza a tu ritmo',
        'Siguiente revisa los campos obligatorios. Anterior te permite revisarlos. La guía no avanza ni envía el formulario.',
      ),
    ];
  } else if (context.page === 'execution') {
    tour.description =
      context.status === 'REQUIRES_CORRECTION'
        ? 'La orden necesita una corrección. Revisa lo solicitado y actualiza las evidencias o la firma que correspondan.'
        : 'Trabaja una unidad a la vez. La guía explica los controles disponibles sin iniciar ni finalizar la orden.';
    tour.steps = [
      step(
        'execution-status',
        'Revisa el estado',
        context.status === 'ASSIGNED'
          ? 'Iniciar Trabajo comienza el servicio. Presiónalo solo cuando estés listo para trabajar.'
          : 'Revisa en qué etapa está el servicio antes de continuar.',
      ),
      step(
        'execution-units',
        'Elige una unidad',
        'Revisa su nombre, vehículo y tipo de servicio. Cambia de pestaña para trabajar en otra unidad.',
      ),
      step(
        'execution-equipment',
        'Comprueba los equipos',
        'Compara los datos con el equipo físico. Durante el trabajo puedes confirmar que coincide o reportar una diferencia.',
      ),
    ];
    if (context.status === 'IN_PROGRESS') {
      tour.steps.push(
        step(
          'execution-checklist',
          'Revisa el vehículo',
          'Durante el trabajo registra el estado de cada parte. Si marcas Mal, explica el detalle y guarda el checklist de esa unidad.',
        ),
        step(
          'execution-evidence',
          'Agrega las fotos',
          'Adjunta las fotos que demuestren el trabajo de esta unidad. Espera a que terminen de guardarse.',
        ),
        step(
          'execution-signature',
          'Pide la firma',
          'Confirma el nombre de quien firma y guarda su firma cuando termine la revisión.',
        ),
        step(
          'execution-close',
          'Revisa antes de cerrar',
          'Aquí aparecen los requisitos pendientes. Finaliza solo después de revisar todo. Si no se pudo realizar la visita, usa Cita Fallida y explica el motivo.',
        ),
      );
    } else if (context.status === 'REQUIRES_CORRECTION') {
      tour.steps.push(
        step(
          'execution-evidence',
          'Corrige la evidencia',
          'Revisa lo solicitado y actualiza únicamente las evidencias necesarias. No vuelvas a iniciar ni finalizar la orden desde este estado.',
        ),
        step(
          'execution-signature',
          'Revisa la firma',
          'Confirma o corrige la firma solicitada. La orden debe volver a revisión cuando termines.',
        ),
      );
    }
  } else if (context.page === 'home') {
    if (admin) {
      tour.steps.push(
        step(
          'new-order',
          'Prepara un servicio nuevo',
          'Nueva Orden abre el formulario para preparar una cita.',
        ),
      );
    }
    tour.steps.push(
      step(
        'order-list',
        'Abre tus órdenes',
        'Consulta las órdenes disponibles para tu función y abre la que necesitas.',
      ),
    );
  } else if (context.page === 'detail' && admin) {
    tour.steps.push(
      step(
        'order-information',
        'Revisa la orden',
        'Comprueba cliente, fecha, técnico y estado antes de hacer cambios. Solo aparecen las acciones válidas para ese estado.',
      ),
      step(
        'order-tabs',
        'Consulta los detalles',
        'Cambia entre unidades, evidencias, auditoría y sincronización. No confundas consultar una pestaña con guardar un cambio.',
      ),
    );
    if (context.status === 'COMPLETED') {
      tour.steps.push(
        step(
          'order-report',
          'Revisa y comparte el reporte',
          'Cuando el PDF esté disponible, puedes descargarlo o enviarlo por correo. Revisa el destinatario antes de enviar.',
        ),
      );
    }
  } else if (context.page === 'sync' && admin) {
    tour.title = 'Sincronización de reportes';
    tour.description =
      'Configura el corte y envío semanal de reportes a administración y supervisa el outbox.';
    tour.steps.push(
      step(
        'sync-schedule',
        'Horario y envío de reportes',
        'Configura el día y hora del corte y envío automático, o envía los reportes técnicos en este momento.',
      ),
      step(
        'sync-summary',
        'Estado del outbox',
        'Revisa el total de operaciones pendientes, en proceso, completadas o fallidas.',
      ),
      step(
        'sync-filters',
        'Filtro de operaciones',
        'Busca operaciones por folio, cliente o estado para reintentar sincronizaciones pendientes.',
      ),
    );
  } else if (context.page === 'inventory' && admin) {
    tour.title = 'Administración de equipos';
    tour.description = 'Consulta y busca equipos registrados en el inventario propio.';
    tour.steps.push(
      step(
        'inventory-filters',
        'Busca equipos',
        'Filtra por IMEI, marca, modelo, cliente, unidad o estado de disponibilidad.',
      ),
      step(
        'inventory-list',
        'Listado de equipos',
        'Visualiza los equipos registrados en la base de datos y edita sus metadatos.',
      ),
    );
  } else if (context.page === 'clients' && admin) {
    tour.title = 'Clientes y destinatarios';
    tour.description =
      'Registra nuevos clientes y gestiona sus correos autorizados para recibir reportes.';
    tour.steps.push(
      step(
        'clients-create',
        'Registra un cliente nuevo',
        'Ingresa el nombre de la empresa o cliente para darlo de alta en el sistema.',
      ),
      step(
        'clients-manage',
        'Gestiona clientes y correos',
        'Selecciona un cliente para editar su nombre o administrar los correos de envío.',
      ),
    );
  } else if (context.page === 'technicians' && admin) {
    tour.title = 'Administración de técnicos';
    tour.description =
      'Da de alta técnicos, configura sus tarifas y datos fiscales, o importa el directorio inicial desde Google Sheets.';
    tour.steps.push(
      step(
        'technicians-actions',
        'Alta e importación',
        'Crea nuevos técnicos directamente desde la app o importa el catálogo inicial desde Google Sheets.',
      ),
      step(
        'technicians-filters',
        'Busca y filtra',
        'Filtra por nombre, clave TEC, taller, ciudad o estado activo/inactivo.',
      ),
      step(
        'technicians-directory',
        'Directorio y edición',
        'Haz clic en cualquier fila o en Editar para modificar datos, tarifas y facturación, o usa el switch para activar o desactivar.',
      ),
    );
  } else if (context.page === 'billing' && canAccessBilling) {
    tour.title = 'Facturación y Cobranza';
    tour.description =
      'Registra facturas, lleva el historial de abonos y controla el estatus de cuenta de cada cliente. Esta guía no guarda ni cambia datos.';
    tour.steps.push(
      step(
        'billing-actions',
        'Registra nuevas facturas',
        'Usa Nueva factura para capturar folio, cliente, tipo, total y vencimiento (20 días por defecto, ajustable).',
      ),
      step(
        'billing-summary',
        'Resumen de cobranza',
        'Consulta al instante la deuda total por cobrar, facturas activas (no pagadas), vencidas y total cobrado.',
      ),
      step(
        'billing-tabs',
        'Facturas y cuentas de clientes',
        'En Facturas registra o elimina abonos (el estatus Pagada/No pagada se actualiza solo). En Cuentas de clientes ajusta estatus, contacto, razón social y promesa de pago.',
      ),
    );
  } else if (context.page === 'technical-reports' && canAccessBilling) {
    tour.title = 'Reporte Técnico semanal';
    tour.description =
      'Consulta la liquidación semanal por técnico, revisa el desglose de unidades y equipos, y captura el envío DHL. Esta guía no cambia datos.';
    tour.steps.push(
      step(
        'technical-reports-week',
        'Navega por semanas',
        'Cambia entre el corte actual y semanas anteriores con las flechas, o regresa rápido con el botón Hoy.',
      ),
      step(
        'technical-reports-summary',
        'Resumen y descargas',
        admin
          ? 'Revisa el total del corte, descarga el Excel consolidado o dispara el envío de reportes por correo.'
          : 'Revisa el total del corte semanal y descarga el archivo Excel consolidado.',
      ),
      step(
        'technical-reports-controls',
        'Cambia de vista o busca',
        'Alterna entre la vista agrupada Por técnico y la lista cronológica Por orden, o busca por folio, cliente, técnico o IMEI.',
      ),
      step(
        'technical-reports-list',
        'Desglose y envío DHL',
        'Expande un técnico para ver sus órdenes y descargar su Excel individual. Haz clic en cualquier orden para abrir el panel lateral con unidades, IMEIs y captura de Envío DHL.',
      ),
    );
  } else if (context.page === 'users' && admin) {
    tour.title = 'Gestión de usuarios y perfiles';
    tour.description =
      'Administra las cuentas con perfil de Administrador y Facturación.';
    tour.steps.push(
      step(
        'users-create',
        'Crea usuarios',
        'Da de alta una cuenta eligiendo su perfil (Administrador o Facturación), nombre, correo y contraseña.',
      ),
      step(
        'users-list',
        'Cuentas registradas',
        'Consulta las cuentas activas, cambia su perfil, actualiza sus datos o restablece contraseñas.',
      ),
    );
  } else if (context.page === 'orders' || context.page === 'shared') {
    tour.steps.push(
      step(
        'order-filters',
        'Encuentra la orden',
        'Busca por folio o cliente y filtra por estado. Si no hay resultados, revisa o limpia los filtros.',
      ),
    );
    if (admin) {
      tour.steps.push(
        step(
          'new-order',
          'Prepara un servicio nuevo',
          'Nueva Orden abre el formulario. Selecciona cliente, unidades y equipos, cita y técnico. Revisa el resumen antes de crearla.',
        ),
      );
    }
    tour.steps.push(
      step(
        'order-list',
        'Abre la orden correcta',
        shared
          ? 'Aquí verás las órdenes asignadas que puedes atender. Comprueba folio, cliente y técnico antes de abrir una.'
          : 'Consulta las órdenes y abre la que necesitas. Los técnicos solo trabajan con las órdenes a las que tienen acceso.',
      ),
    );
  } else {
    // General fallback: only navigation and help steps
  }
  tour.steps.push(
    step(
      'help',
      'Vuelve cuando lo necesites',
      'Puedes repetir esta guía con Ayuda. Ciérrala cuando quieras; no perderás lo que hayas escrito.',
    ),
  );
  return tour;
}
