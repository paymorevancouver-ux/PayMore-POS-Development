import { ROLE_PERMISSIONS } from '@/constants/config';
import type { Employee, EmployeeRole } from '@/types';

/** Match an active employee by PIN using the existing employee records. Never log the PIN. */
export function findActiveEmployeeByPin(employees: Employee[], pin: string): Employee | undefined {
  const entered = pin.trim();
  if (!entered) return undefined;
  return employees.find((e) => e.isActive && e.pin === entered);
}

/** Buy / Trade uses the existing `customer` module permission. */
export function canPerformBuyTrade(role: EmployeeRole): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes('customer');
}
