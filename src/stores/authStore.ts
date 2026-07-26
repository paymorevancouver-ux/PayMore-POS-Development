import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORES } from '@/constants/mockData';
import type { Employee, Store, EmployeeRole } from '@/types';
import { ROLE_PERMISSIONS } from '@/constants/config';
import { generateId } from '@/lib/taxCalc';
import { db } from '@/lib/database';
import { PROD_EMPLOYEES } from '@/constants/migrationData';

interface LoginActivity {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  action: 'login' | 'logout' | 'timeout' | 'pin-change' | 'employee-create' | 'employee-update' | 'employee-deactivate';
  details: string;
  createdAt: string;
}

interface AuthState {
  employee: Employee | null;
  store: Store | null;
  isAuthenticated: boolean;
  lastActivity: string | null;
  sessionTimeoutMinutes: number;
  employees: Employee[];
  loginActivity: LoginActivity[];

  login: (pin: string, storeId: string) => Promise<Employee | null>;
  logout: () => void;
  checkSessionTimeout: () => boolean;
  touchActivity: () => void;
  loadEmployees: (storeId: string) => Promise<void>;

  addEmployee: (data: Omit<Employee, 'id' | 'createdAt'>) => string;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  deactivateEmployee: (id: string) => void;
  resetPin: (id: string, newPin: string) => void;
  changeOwnPin: (oldPin: string, newPin: string) => boolean;
  setSessionTimeout: (minutes: number) => void;

  getEmployeeName: (id: string) => string;
  hasPermission: (module: string) => boolean;
  getEmployeeById: (id: string) => Employee | undefined;
  logActivity: (action: LoginActivity['action'], details: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      employee: null,
      store: null,
      isAuthenticated: false,
      lastActivity: null,
      sessionTimeoutMinutes: 30,
      employees: PROD_EMPLOYEES,
      loginActivity: [],

      loadEmployees: async (storeId: string) => {
        const employees = await db.getEmployees(storeId);
        if (employees.length > 0) {
          set({ employees });
        }
      },

      login: async (pin: string, storeId: string) => {
        // Load employees from DB first
        await get().loadEmployees(storeId);
        const emp = get().employees.find((e) => e.pin === pin && e.isActive);
        if (!emp) return null;
        const store = STORES.find((s) => s.id === storeId) || STORES[0];
        const now = new Date().toISOString();
        set({ employee: emp, store, isAuthenticated: true, lastActivity: now });
        get().logActivity('login', `${emp.fullName} logged in at ${store.name}`);
        return emp;
      },

      logout: () => {
        const emp = get().employee;
        if (emp) {
          get().logActivity('logout', `${emp.fullName} logged out`);
        }
        set({ employee: null, store: null, isAuthenticated: false, lastActivity: null });
      },

      checkSessionTimeout: () => {
        const { lastActivity, sessionTimeoutMinutes, isAuthenticated } = get();
        if (!isAuthenticated || !lastActivity) return false;
        const elapsed = (Date.now() - new Date(lastActivity).getTime()) / 1000 / 60;
        if (elapsed >= sessionTimeoutMinutes) {
          const emp = get().employee;
          if (emp) get().logActivity('timeout', `${emp.fullName} session timed out after ${sessionTimeoutMinutes}min`);
          set({ employee: null, store: null, isAuthenticated: false, lastActivity: null });
          return true;
        }
        return false;
      },

      touchActivity: () => {
        if (get().isAuthenticated) set({ lastActivity: new Date().toISOString() });
      },

      addEmployee: (data) => {
        const id = generateId('EMP');
        const emp: Employee = { ...data, id, createdAt: new Date().toISOString() };
        set((s) => ({ employees: [...s.employees, emp] }));
        const store = get().store;
        if (store) db.upsertEmployee(store.id, emp);
        get().logActivity('employee-create', `Created employee: ${data.fullName} (${data.role})`);
        return id;
      },

      updateEmployee: (id, data) => {
        set((s) => ({ employees: s.employees.map((e) => e.id === id ? { ...e, ...data } : e) }));
        db.updateEmployee(id, data);
        const emp = get().employees.find((e) => e.id === id);
        get().logActivity('employee-update', `Updated employee: ${emp?.fullName || id}`);
      },

      deactivateEmployee: (id) => {
        const emp = get().employees.find((e) => e.id === id);
        set((s) => ({ employees: s.employees.map((e) => e.id === id ? { ...e, isActive: false } : e) }));
        db.updateEmployee(id, { isActive: false });
        get().logActivity('employee-deactivate', `Deactivated employee: ${emp?.fullName || id}`);
      },

      resetPin: (id, newPin) => {
        set((s) => ({ employees: s.employees.map((e) => e.id === id ? { ...e, pin: newPin } : e) }));
        db.updateEmployee(id, { pin: newPin });
        const emp = get().employees.find((e) => e.id === id);
        get().logActivity('pin-change', `PIN reset for employee: ${emp?.fullName || id}`);
      },

      changeOwnPin: (oldPin, newPin) => {
        const emp = get().employee;
        if (!emp || emp.pin !== oldPin) return false;
        set((s) => ({
          employees: s.employees.map((e) => e.id === emp.id ? { ...e, pin: newPin } : e),
          employee: { ...emp, pin: newPin },
        }));
        db.updateEmployee(emp.id, { pin: newPin });
        get().logActivity('pin-change', `${emp.fullName} changed their own PIN`);
        return true;
      },

      setSessionTimeout: (minutes) => set({ sessionTimeoutMinutes: minutes }),

      getEmployeeName: (id: string) => get().employees.find((e) => e.id === id)?.fullName || 'Unknown',
      getEmployeeById: (id: string) => get().employees.find((e) => e.id === id),

      hasPermission: (module: string) => {
        const emp = get().employee;
        if (!emp) return false;
        const perms = ROLE_PERMISSIONS[emp.role as EmployeeRole] || [];
        return perms.includes('*') || perms.includes(module);
      },

      logActivity: (action, details) => {
        const { employee, store } = get();
        const entry: LoginActivity = {
          id: generateId('LA'), employeeId: employee?.id || 'system',
          employeeName: employee?.fullName || 'System',
          storeId: store?.id || '', action, details, createdAt: new Date().toISOString(),
        };
        set((s) => ({ loginActivity: [entry, ...s.loginActivity].slice(0, 500) }));
      },
    }),
    { name: 'paymore-auth-v3' }
  )
);
