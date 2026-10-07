import { describe, expect, it, vi } from 'vitest';
import { useInventoryRegistration, type RegistrationContext } from './useInventoryRegistration.js';
import type { ExternalEquipment } from '@puk/contracts';
const key = '11111111-1111-4111-8111-111111111111';
function setup() {
  const context: RegistrationContext = {
    canRegister: true,
    registrationAllowed: true,
    serviceType: 'INSTALLATION',
    clientSheetId: 'C1',
    clientName: 'Client',
  };
  const register = vi
    .fn()
    .mockResolvedValue({ source: 'DB', imei: '123456789012345' } as ExternalEquipment);
  const created = vi.fn();
  const form = useInventoryRegistration(
    () => context,
    register,
    created,
    () => key,
  );
  Object.assign(form.form.value, { brand: 'GPS', model: 'Model', imei: '123456789012345' });
  return { context, register, created, form };
}
describe('inline inventory registration', () => {
  it('adapts proposed state before save, with no inventory mutation on service change', () => {
    const f = setup();
    expect(f.form.state.value).toBe('AVAILABLE');
    f.context.serviceType = 'REVIEW';
    // Getter context normally comes from reactive props; a new computed read starts with review.
    const second = useInventoryRegistration(() => f.context, f.register, f.created);
    expect(second.state.value).toBe('INSTALLED');
    expect(f.register).not.toHaveBeenCalled();
  });
  it('preserves captured data when closing/abandoning an order', () => {
    const f = setup();
    f.form.open();
    f.form.showForm.value = false;
    f.form.open();
    expect(f.form.form.value.imei).toBe('123456789012345');
    expect(f.register).not.toHaveBeenCalled();
  });
  it('keeps data and same registration key after a lost response', async () => {
    const f = setup();
    f.register.mockRejectedValueOnce(new Error('lost response'));
    await f.form.save();
    expect(f.form.form.value.imei).toBe('123456789012345');
    await f.form.save();
    expect(f.register.mock.calls[0]![0].registrationKey).toBe(
      f.register.mock.calls[1]![0].registrationKey,
    );
    expect(f.created).toHaveBeenCalledOnce();
  });
  it('pauses new requests during source outage, preserving capture for recovery', async () => {
    const f = setup();
    f.context.registrationAllowed = false;
    await f.form.save();
    expect(f.register).not.toHaveBeenCalled();
    expect(f.form.form.value.brand).toBe('GPS');
    f.context.registrationAllowed = true;
    await f.form.save();
    expect(f.created).toHaveBeenCalledOnce();
  });
  it('requires real installed unit details and captures selected client', async () => {
    const f = setup();
    f.context.serviceType = 'REVIEW';
    await f.form.save();
    expect(f.register).not.toHaveBeenCalled();
    Object.assign(f.form.form.value, { label: 'Truck', makeModel: 'Make', serialNumber: 'VIN' });
    await f.form.save();
    expect(f.register).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSheetId: 'C1',
        unit: expect.objectContaining({ serialNumber: 'VIN' }),
      }),
    );
  });
  it('offers duplicate identity while preserving the form', async () => {
    const f = setup();
    f.register.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'DUPLICATE_IMEI',
            message: 'Duplicate',
            details: { existingKeys: ['EQ-1'] },
          },
        },
      },
    });
    await f.form.save();
    expect(f.form.existingKeys.value).toEqual(['EQ-1']);
    expect(f.form.form.value.imei).toBe('123456789012345');
  });
  it('does not send unauthorized registration', async () => {
    const f = setup();
    f.context.canRegister = false;
    await f.form.save();
    expect(f.register).not.toHaveBeenCalled();
  });
});
