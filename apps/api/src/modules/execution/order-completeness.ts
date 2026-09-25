import { MIN_REQUIRED_EVIDENCE_PHOTOS, type ChecklistCategory } from '@puk/contracts';

export const ALL_CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  'DASHBOARD',
  'WINDOWS',
  'ACCESSORIES',
  'TRIMS',
  'BODYWORK',
];

export interface UnitEquipmentForCompleteness {
  externalKey: string;
  verificationStatus: string;
}

export interface ChecklistEvidenceForCompleteness {
  status?: string;
}

export interface ChecklistItemForCompleteness {
  category: string;
  evidence?: ChecklistEvidenceForCompleteness[];
}

export interface UnitChecklistForCompleteness {
  items: ChecklistItemForCompleteness[];
}

export interface OrderUnitForCompleteness {
  label: string;
  equipment: UnitEquipmentForCompleteness[];
  evidence?: ChecklistEvidenceForCompleteness[];
  checklist?: UnitChecklistForCompleteness | null;
}

export interface OrderSignatureForCompleteness {
  signerName?: string | null;
}

export interface OrderForCompletenessEvaluation {
  units: OrderUnitForCompleteness[];
  signature?: OrderSignatureForCompleteness | null;
}

export interface CompletenessResult {
  isComplete: boolean;
  missingRequirements: string[];
}

/**
 * Pure domain function implementing the specification for whether a service order
 * satisfies all closing and execution requirements (equipment verified, checklist completed,
 * minimum evidence photos uploaded, client signature registered).
 */
export function evaluateOrderCompleteness(
  order: OrderForCompletenessEvaluation,
): CompletenessResult {
  const missing: string[] = [];

  if (order.units.length === 0) {
    missing.push('No hay unidades registradas en la orden');
  }

  for (const unit of order.units) {
    // 1. All equipments must be verified (MATCHED or DISCREPANCY_REPORTED)
    for (const eq of unit.equipment) {
      if (eq.verificationStatus === 'PENDING') {
        missing.push(`Equipo ${eq.externalKey} en unidad ${unit.label} pendiente de verificación`);
      }
    }

    // 2. Checklist items for all categories
    const checklist = unit.checklist;
    if (!checklist) {
      missing.push(`Checklist pendiente en unidad ${unit.label}`);
    } else {
      const itemMap = new Map(checklist.items.map((i) => [i.category, i]));
      for (const cat of ALL_CHECKLIST_CATEGORIES) {
        const item = itemMap.get(cat);
        if (!item) {
          missing.push(`Falta categoría ${cat} en checklist de unidad ${unit.label}`);
        }
      }

    }

    // Photos are owned by the unit; they are not attached to checklist sections.
    const totalEvidence =
      unit.evidence?.filter((e) => e.status === undefined || e.status === 'COMPLETED').length ?? 0;
    if (totalEvidence < MIN_REQUIRED_EVIDENCE_PHOTOS) {
      missing.push(
        `Se requieren al menos ${MIN_REQUIRED_EVIDENCE_PHOTOS} fotografías de evidencia en unidad ${unit.label} (actualmente ${totalEvidence}/${MIN_REQUIRED_EVIDENCE_PHOTOS})`,
      );
    }
  }

  // 3. Signature presence
  if (!order.signature || !order.signature.signerName) {
    missing.push('Falta firma y nombre del cliente');
  }

  return {
    isComplete: missing.length === 0,
    missingRequirements: missing,
  };
}
