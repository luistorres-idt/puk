import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import {
  assertCanEditOrder,
  assertCanExecuteWork,
  assertCanModifyUnits,
  assertValidOrderTransition,
  canTransitionOrder,
} from './order-state-machine.js';

describe('Order State Machine', () => {
  describe('canTransitionOrder', () => {
    it('allows identical status transition (idempotent)', () => {
      expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.DRAFT)).toBe(true);
      expect(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.COMPLETED)).toBe(true);
    });

    it('allows valid normal lifecycle transitions', () => {
      expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.ASSIGNED)).toBe(true);
      expect(canTransitionOrder(OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS)).toBe(true);
      expect(canTransitionOrder(OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED)).toBe(true);
    });

    it('allows correction workflow transitions', () => {
      expect(canTransitionOrder(OrderStatus.IN_PROGRESS, OrderStatus.REQUIRES_CORRECTION)).toBe(
        true,
      );
      expect(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.REQUIRES_CORRECTION)).toBe(true);
      expect(canTransitionOrder(OrderStatus.REQUIRES_CORRECTION, OrderStatus.IN_PROGRESS)).toBe(
        true,
      );
      expect(canTransitionOrder(OrderStatus.REQUIRES_CORRECTION, OrderStatus.ASSIGNED)).toBe(true);
    });

    it('allows cancellation from non-terminal states', () => {
      expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.CANCELLED)).toBe(true);
      expect(canTransitionOrder(OrderStatus.ASSIGNED, OrderStatus.CANCELLED)).toBe(true);
      expect(canTransitionOrder(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED)).toBe(true);
      expect(canTransitionOrder(OrderStatus.REQUIRES_CORRECTION, OrderStatus.CANCELLED)).toBe(true);
    });

    it('allows failed appointment from assigned or in_progress', () => {
      expect(canTransitionOrder(OrderStatus.ASSIGNED, OrderStatus.FAILED_APPOINTMENT)).toBe(true);
      expect(canTransitionOrder(OrderStatus.IN_PROGRESS, OrderStatus.FAILED_APPOINTMENT)).toBe(
        true,
      );
    });

    it('rejects invalid transitions', () => {
      // Cannot jump from DRAFT to COMPLETED
      expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.COMPLETED)).toBe(false);
      // Cannot cancel COMPLETED order
      expect(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.CANCELLED)).toBe(false);
      // Cannot transition out of FAILED_APPOINTMENT
      expect(canTransitionOrder(OrderStatus.FAILED_APPOINTMENT, OrderStatus.IN_PROGRESS)).toBe(
        false,
      );
      // Cannot transition out of CANCELLED
      expect(canTransitionOrder(OrderStatus.CANCELLED, OrderStatus.DRAFT)).toBe(false);
    });
  });

  describe('assertValidOrderTransition', () => {
    it('does not throw on valid transition', () => {
      expect(() =>
        assertValidOrderTransition(OrderStatus.DRAFT, OrderStatus.ASSIGNED),
      ).not.toThrow();
    });

    it('throws AppError 400 on invalid transition', () => {
      expect(() => assertValidOrderTransition(OrderStatus.COMPLETED, OrderStatus.DRAFT)).toThrow(
        AppError,
      );
    });
  });

  describe('assertCanEditOrder', () => {
    it('allows editing DRAFT and REQUIRES_CORRECTION', () => {
      expect(() => assertCanEditOrder(OrderStatus.DRAFT)).not.toThrow();
      expect(() => assertCanEditOrder(OrderStatus.REQUIRES_CORRECTION)).not.toThrow();
    });

    it('rejects editing in other states', () => {
      expect(() => assertCanEditOrder(OrderStatus.ASSIGNED)).toThrow(AppError);
      expect(() => assertCanEditOrder(OrderStatus.IN_PROGRESS)).toThrow(AppError);
      expect(() => assertCanEditOrder(OrderStatus.COMPLETED)).toThrow(AppError);
    });
  });

  describe('assertCanModifyUnits', () => {
    it('allows modifying units in DRAFT only', () => {
      expect(() => assertCanModifyUnits(OrderStatus.DRAFT)).not.toThrow();
      expect(() => assertCanModifyUnits(OrderStatus.ASSIGNED)).toThrow(AppError);
      expect(() => assertCanModifyUnits(OrderStatus.REQUIRES_CORRECTION)).toThrow(AppError);
    });
  });

  describe('assertCanExecuteWork', () => {
    it('allows work in IN_PROGRESS only', () => {
      expect(() => assertCanExecuteWork(OrderStatus.IN_PROGRESS)).not.toThrow();
      expect(() => assertCanExecuteWork(OrderStatus.DRAFT)).toThrow(AppError);
      expect(() => assertCanExecuteWork(OrderStatus.ASSIGNED)).toThrow(AppError);
    });
  });
});
