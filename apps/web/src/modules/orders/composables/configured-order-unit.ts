import type { ExternalEquipment, OrderServiceType } from '@puk/contracts';

export interface ConfiguredUnitItem {
  id: string;
  serviceType: OrderServiceType;
  label: string;
  makeModel: string;
  serialNumber: string;
  year: number | null;
  equipment: ExternalEquipment | null;
  replacementEquipment?: ExternalEquipment | null;
}
