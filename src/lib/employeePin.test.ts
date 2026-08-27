import { describe, expect, it } from 'vitest';
import { canPerformBuyTrade, findActiveEmployeeByPin } from './employeePin';
import type { Employee } from '@/types';

const employees: Employee[] = [
  {
    id: 'EMP-NITESH', fullName: 'Nitesh', email: 'n@example.com', pin: '2468',
    role: 'buyer', isActive: true, createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EMP-ADMIN', fullName: 'Admin User', email: 'a@example.com', pin: '1111',
    role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EMP-OLD', fullName: 'Inactive', email: 'i@example.com', pin: '9999',
    role: 'cashier', isActive: false, createdAt: '2026-01-01T00:00:00Z',
  },
];

describe('employeePin', () => {
  it('identifies the active employee for a valid PIN', () => {
    const emp = findActiveEmployeeByPin(employees, '2468');
    expect(emp?.id).toBe('EMP-NITESH');
    expect(emp?.fullName).toBe('Nitesh');
  });

  it('rejects an invalid PIN', () => {
    expect(findActiveEmployeeByPin(employees, '0000')).toBeUndefined();
  });

  it('rejects an inactive employee PIN', () => {
    expect(findActiveEmployeeByPin(employees, '9999')).toBeUndefined();
  });

  it('allows buyer and admin roles to start Buy / Trade', () => {
    expect(canPerformBuyTrade('buyer')).toBe(true);
    expect(canPerformBuyTrade('admin')).toBe(true);
    expect(canPerformBuyTrade('cashier')).toBe(true);
  });
});
