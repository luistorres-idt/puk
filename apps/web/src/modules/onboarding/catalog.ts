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
  const audience = shared ? 'shared' : admin ? 'admin' : 'technician';
  const tour: Tour = {
    id: `${audience}:${context.page}:${context.status}:${context.step}`,
    title: shared
      ? 'Tu tablero de trabajo'
      : admin
        ? 'Tu guía de administración'
        : 'Tu guía de trabajo',
    description: shared
      ? 'Esta cuenta es compartida. Puedes atender órdenes asignadas y activas. No muestra opciones administrativas.'
      : admin
        ? 'Crea la orden, asigna al técnico y revisa el resultado. Esta guía solo explica: no guarda ni cambia datos.'
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
        step('new-order', 'Prepara un servicio nuevo', 'Nueva Orden abre el formulario para preparar una cita.'),
      );
    }
    tour.steps.push(
      step('order-list', 'Abre tus órdenes', 'Consulta las órdenes disponibles para tu función y abre la que necesitas.'),
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
  } else {
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
