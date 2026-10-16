import { describe, expect, it } from 'vitest';
import {
  calculateOrderPricing,
  calculatePersistableOrderPricing,
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
    it('accepts the Decimal(10,2) maximum and rejects calculated totals beyond it', () => {
      const atLimit = calculatePersistableOrderPricing({
        technician: { ...mockTech, installationRate: '99999999.99' },
        serviceType: 'INSTALLATION',
        equipmentCount: 1,
        isHomeService: false,
      });
      expect(atLimit.total.toFixed(2)).toBe('99999999.99');

      expect(() =>
        calculatePersistableOrderPricing({
          technician: { ...mockTech, installationRate: '99999999.99' },
          serviceType: 'INSTALLATION',
          equipmentCount: 2,
          isHomeService: false,
        }),
      ).toThrowError(expect.objectContaining({ code: 'PRICING_AMOUNT_OUT_OF_RANGE', status: 400 }));
    });

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

    it('defaults to 0.00 and emits warning when required rate is missing for normal services', () => {
      const techMissing: TechnicianPricingSource = {
        ...mockTech,
        reviewRate: null,
      };

      const pricing = calculateOrderPricing({
        technician: techMissing,
        serviceType: 'REVIEW',
        equipmentCount: 1,
        isHomeService: false,
      });

      expect(pricing.unitRate?.toFixed(2)).toBe('0.00');
      expect(pricing.baseCost.toFixed(2)).toBe('0.00');
      expect(pricing.total.toFixed(2)).toBe('0.00');
      expect(pricing.warnings).toBeDefined();
      expect(pricing.warnings?.length).toBeGreaterThan(0);
      expect(pricing.warnings?.[0]).toContain(
        'no tiene configurada una tarifa válida para el servicio REVISION',
      );
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

    it('calculates multi-service order pricing with combined base cost and itemized breakdown', () => {
      // mockTech has installationRate: 700.00, reviewRate: 400.00, departureCost: 350.00
      const pricing = calculateOrderPricing({
        technician: mockTech,
        isHomeService: true,
        items: [
          { serviceType: 'INSTALLATION', equipmentCount: 2 },
          { serviceType: 'REVIEW', equipmentCount: 1 },
        ],
      });

      // Base: (2 * 700) + (1 * 400) = 1400 + 400 = 1800.00
      expect(pricing.baseCost.toFixed(2)).toBe('1800.00');
      // Travel: 350.00 once
      expect(pricing.travelExpenses.toFixed(2)).toBe('350.00');
      // Total: 2150.00
      expect(pricing.total.toFixed(2)).toBe('2150.00');
      expect(pricing.appliedQuantity).toBe(3);
      expect(pricing.breakdown).toHaveLength(2);

      const installBreakdown = pricing.breakdown.find((b) => b.serviceType === 'INSTALLATION');
      expect(installBreakdown?.quantity).toBe(2);
      expect(installBreakdown?.subtotal.toFixed(2)).toBe('1400.00');

      const reviewBreakdown = pricing.breakdown.find((b) => b.serviceType === 'REVIEW');
      expect(reviewBreakdown?.quantity).toBe(1);
      expect(reviewBreakdown?.subtotal.toFixed(2)).toBe('400.00');
    });

    it('charges each replacement unit once when an order has multiple replacements', () => {
      const pricing = calculateOrderPricing({
        technician: mockTech,
        isHomeService: false,
        items: [
          { serviceType: 'EQUIPMENT_REPLACEMENT', equipmentCount: 2 },
          { serviceType: 'EQUIPMENT_REPLACEMENT', equipmentCount: 2 },
        ],
      });

      expect(pricing.appliedQuantity).toBe(2);
      expect(pricing.baseCost.toFixed(2)).toBe('1000.00');
      expect(pricing.breakdown).toEqual([
        expect.objectContaining({
          serviceType: 'EQUIPMENT_REPLACEMENT',
          quantity: 2,
        }),
      ]);
    });

    describe('pricing overrides', () => {
      it('applies custom service rate override over technician default', () => {
        const pricing = calculateOrderPricing({
          technician: mockTech,
          serviceType: 'INSTALLATION',
          equipmentCount: 2,
          isHomeService: false,
          overrides: {
            rates: { INSTALLATION: '850.00' },
          },
        });

        // 850 * 2 = 1700
        expect(pricing.unitRate?.toFixed(2)).toBe('850.00');
        expect(pricing.baseCost.toFixed(2)).toBe('1700.00');
        expect(pricing.total.toFixed(2)).toBe('1700.00');
        expect(pricing.warnings).toHaveLength(0);
      });

      it('applies custom travel expenses override regardless of isHomeService', () => {
        const pricing = calculateOrderPricing({
          technician: mockTech,
          serviceType: 'INSTALLATION',
          equipmentCount: 1,
          isHomeService: false, // normally 0.00
          overrides: {
            travelExpenses: '450.00',
          },
        });

        expect(pricing.travelExpenses.toFixed(2)).toBe('450.00');
        expect(pricing.baseCost.toFixed(2)).toBe('700.00');
        expect(pricing.total.toFixed(2)).toBe('1150.00');
      });

      it('applies partial overrides in multi-service orders', () => {
        const pricing = calculateOrderPricing({
          technician: mockTech,
          isHomeService: true,
          items: [
            { serviceType: 'INSTALLATION', equipmentCount: 1 },
            { serviceType: 'REVIEW', equipmentCount: 1 },
          ],
          overrides: {
            rates: {
              INSTALLATION: '900.00', // override (default is 700)
              // REVIEW is omitted => should use mockTech.reviewRate (400)
            },
            departureCost: '500.00', // override departure (default is 350)
          },
        });

        expect(pricing.baseCost.toFixed(2)).toBe('1300.00'); // 900 + 400
        expect(pricing.departureCost.toFixed(2)).toBe('500.00');
        expect(pricing.travelExpenses.toFixed(2)).toBe('500.00');
        expect(pricing.total.toFixed(2)).toBe('1800.00'); // 1300 + 500
      });

      it('applies custom override to FAILED_APPOINTMENT', () => {
        const pricing = calculateOrderPricing({
          technician: mockTech,
          serviceType: 'FAILED_APPOINTMENT',
          equipmentCount: 1,
          isHomeService: false,
          overrides: {
            rates: { FAILED_APPOINTMENT: '450.00' }, // default was 250
            travelExpenses: '100.00',
          },
        });

        expect(pricing.baseCost.toFixed(2)).toBe('450.00');
        expect(pricing.travelExpenses.toFixed(2)).toBe('100.00');
        expect(pricing.total.toFixed(2)).toBe('550.00');
        expect(pricing.warnings).toHaveLength(0);
      });

      it('allows overriding a rate that was unconfigured on the technician without emitting warnings', () => {
        const techMissing: TechnicianPricingSource = {
          ...mockTech,
          installationRate: null,
        };
        const pricing = calculateOrderPricing({
          technician: techMissing,
          serviceType: 'INSTALLATION',
          equipmentCount: 1,
          isHomeService: false,
          overrides: {
            rates: { INSTALLATION: '600.00' },
          },
        });

        expect(pricing.baseCost.toFixed(2)).toBe('600.00');
        expect(pricing.total.toFixed(2)).toBe('600.00');
        expect(pricing.warnings).toHaveLength(0);
      });
    });
  });
});
