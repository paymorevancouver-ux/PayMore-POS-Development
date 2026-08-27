import { ROLE_PERMISSIONS } from '@/constants/config';
import type { Employee, EmployeeRole } from '@/types';

/** Match an active employee by PIN using the existing employee records. Never log the PIN. */
export function findActiveEmployeeByPin(employees: Employee[], pin: string): Employee | undefined {
  const entered = pin.trim();
  if (!entered) return undefined;
  return employees.find((e) => e.isActive && e.pin === entered);
}

function roleHasModule(role: EmployeeRole, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(module);
}

/** Buy / Trade uses the existing `customer` module permission. */
export function canPerformBuyTrade(role: EmployeeRole): boolean {
  return roleHasModule(role, 'customer');
}

/** Manual cash drawer changes use the existing `drawer` module permission. */
export function canAdjustCashDrawer(role: EmployeeRole): boolean {
  return roleHasModule(role, 'drawer');
}

/** Identify an employee by PIN, then check that employee's permission for the action. */
export function verifyEmployeeForAction(
  employees: Employee[],
  pin: string,
  permissionCheck: (role: EmployeeRole) => boolean,
): { ok: true; employee: Employee } | { ok: false; reason: 'invalid' | 'permission' } {
  const emp = findActiveEmployeeByPin(employees, pin);
  if (!emp) return { ok: false, reason: 'invalid' };
  if (!permissionCheck(emp.role)) return { ok: false, reason: 'permission' };
  return { ok: true, employee: emp };
}
