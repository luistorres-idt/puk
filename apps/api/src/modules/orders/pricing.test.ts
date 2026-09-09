import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import {
  calculateOrderPricing,
  resolveServiceRate,
  type TechnicianPricingSource,
} from './pricing.js';

describe('Pricing Calculation Module', () => {
  const mockTech: TechnicianPricingSource = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Juan Perez',
    externalKey: 'TEC-0001',
    departureCost: '350.00',
    installationRate: '700.00',
    reviewRate: '400.00',
    uninstallationRate: '450.00',
    failedAppointmentRate: '250.00',
    fuelSensorRate: '600.00',
    replacementRate: '500.00',
  };

  describe('resolveServiceRate', () => {
    it('resolves INSTALLATION rate', () => {
      const res = resolveServiceRate(mockTech, 'INSTALLATION');
      expect(res.rate?.toString()).toBe('700');
      expect(res.isConfigured).toBe(true);
      expect(res.rateLabel).toBe('INSTALACION');
    });

    it('resolves REVIEW rate', () => {
      const res = resolveServiceRate(mockTech, 'REVIEW');
      expect(res.rate?.toString()).toBe('400');
      expect(res.rateLabel).toBe('REVISION');
    });

    it('resolves UNINSTALLATION rate', () => {
      const res = resolveServiceRate(mockTech, 'UNINSTALLATION');
      expect(res.rate?.toString()).toBe('450');
      expect(res.rateLabel).toBe('DESINSTALACION');
    });

    it('resolves FAILED_APPOINTMENT rate', () => {
      const res = resolveServiceRate(mockTech, 'FAILED_APPOINTMENT');
      expect(res.rate?.toString()).toBe('250');
      expect(res.rateLabel).toBe('CITA FALLIDA');
    });

    it('resolves FUEL_SENSOR rate', () => {
      const res = resolveServiceRate(mockTech, 'FUEL_SENSOR');
      expect(res.rate?.toString()).toBe('600');
      expect(res.rateLabel).toBe('SENSOR FUEL');
    });

    it('resolves EQUIPMENT_REPLACEMENT rate', () => {
      const res = resolveServiceRate(mockTech, 'EQUIPMENT_REPLACEMENT');
      expect(res.rate?.toString()).toBe('500');
      expect(res.rateLabel).toBe('CAMBIO DE EQUIPO');
    });

    it('returns null and isConfigured=false when rate is missing or null', () => {
      const techWithoutRates: TechnicianPricingSource = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Carlos Sin Tarifas',
        installationRate: null,
      };
      const res = resolveServiceRate(techWithoutRates, 'INSTALLATION');
      expect(res.rate).toBeNull();
      expect(res.isConfigured).toBe(false);
    });

    it('handles explicit 0.00 as configured', () => {
      const techZero: TechnicianPricingSource = {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Tecnico Cero',
        installationRate: '0.00',
      };
      const res = resolveServiceRate(techZero, 'INSTALLATION');
      expect(res.rate?.toString()).toBe('0');
      expect(res.isConfigured).toBe(true);
    });
  });

  describe('calculateOrderPricing', () => {
    it('calculates baseCost by equipment count (not vehicles)', () => {
      // 3 equipments, workshop service (isHomeService: false)
      const pricing = calculateOrderPricing({
        technician: mockTech,
        serviceType: 'INSTALLATION',
        equipmentCount: 3,
        isHomeService: false,
      });

      expect(pricing.appliedQuantity).toBe(3);
      expect(pricing.unitRate?.toString()).toBe('700');
      expect(pricing.baseCost.toString()).toBe('2100');
      expect(pricing.departureCost.toString()).toBe('350');
      expect(pricing.travelExpenses.toString()).toBe('0');
      expect(pricing.total.toString()).toBe('2100');
      expect(pricing.currency).toBe('MXN');
    });

    it('adds travel expenses once when isHomeService is true, without multiplying by equipment count', () => {
      // 4 equipments, isHomeService: true
      const pricing = calculateOrderPricing({
        technician: mockTech,
        serviceType: 'INSTALLATION',
        equipmentCount: 4,
        isHomeService: true,
      });

      expect(pricing.appliedQuantity).toBe(4);
      expect(pricing.baseCost.toString()).toBe('2800'); // 700 * 4
      expect(pricing.travelExpenses.toString()).toBe('350'); // 350 once!
      expect(pricing.total.toString()).toBe('3150'); // 2800 + 350
    });

    it('charges exactly 1 unit in EQUIPMENT_REPLACEMENT regardless of equipment count', () => {
      // 2 equipments selected (new + old), replacementRate is 500
      const pricing = calculateOrderPricing({
        technician: mockTech,
        serviceType: 'EQUIPMENT_REPLACEMENT',
        equipmentCount: 2,
        isHomeService: true,
      });

      expect(pricing.appliedQuantity).toBe(1);
      expect(pricing.baseCost.toString()).toBe('500');
      expect(pricing.travelExpenses.toString()).toBe('350');
      expect(pricing.total.toString()).toBe('850');
    });

    it('rounds normally to 2 decimals', () => {
      const techOdd: TechnicianPricingSource = {
        ...mockTech,
        installationRate: '333.333',
        departureCost: '111.111',
      };
      const pricing = calculateOrderPricing({
        technician: techOdd,
        serviceType: 'INSTALLATION',
        equipmentCount: 3,
        isHomeService: true,
      });

      // 333.33 * 3 = 999.99, travel = 111.11, total = 1111.10
      expect(pricing.baseCost.toFixed(2)).toBe('999.99');
      expect(pricing.travelExpenses.toFixed(2)).toBe('111.11');
      expect(pricing.total.toFixed(2)).toBe('1111.10');
    });

    it('throws AppError when required rate is missing for normal services', () => {
      const techMissing: TechnicianPricingSource = {
        ...mockTech,
        reviewRate: null,
      };

      expect(() =>
        calculateOrderPricing({
          technician: techMissing,
          serviceType: 'REVIEW',
          equipmentCount: 1,
          isHomeService: false,
        }),
      ).toThrow(AppError);
    });

    it('handles FAILED_APPOINTMENT with valid rate', () => {
      const pricing = calculateOrderPricing({
        technician: mockTech,
        serviceType: 'FAILED_APPOINTMENT',
        equipmentCount: 2,
        isHomeService: false,
      });

      expect(pricing.appliedQuantity).toBe(2);
      expect(pricing.baseCost.toString()).toBe('500'); // 250 * 2
      expect(pricing.total.toString()).toBe('500');
    });

    it('handles FAILED_APPOINTMENT when rate is null/invalid by returning 0.00 without throwing', () => {
      const techNoFailRate: TechnicianPricingSource = {
        ...mockTech,
        failedAppointmentRate: null,
      };

      const pricing = calculateOrderPricing({
        technician: techNoFailRate,
        serviceType: 'FAILED_APPOINTMENT',
        equipmentCount: 1,
        isHomeService: true,
      });

      expect(pricing.baseCost.toFixed(2)).toBe('0.00');
      expect(pricing.travelExpenses.toFixed(2)).toBe('0.00');
      expect(pricing.total.toFixed(2)).toBe('0.00');
      expect(pricing.unitRate).toBeNull();
    });

    it('allows explicit 0.00 rate without throwing', () => {
      const techZero: TechnicianPricingSource = {
        ...mockTech,
        installationRate: '0.00',
      };

      const pricing = calculateOrderPricing({
        technician: techZero,
        serviceType: 'INSTALLATION',
        equipmentCount: 2,
        isHomeService: false,
      });

      expect(pricing.baseCost.toFixed(2)).toBe('0.00');
      expect(pricing.total.toFixed(2)).toBe('0.00');
      expect(pricing.unitRate?.toFixed(2)).toBe('0.00');
    });
  });
});
