import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import type { Employee } from '@/types';

/** PIN-verified entry into the existing Buy / Trade visit workflow. */
export function useStartBuyTrade() {
  const navigate = useNavigate();
  const setActingEmployeeId = usePosStore((s) => s.setActingEmployeeId);
  const [pinOpen, setPinOpen] = useState(false);
  const pendingCustomerId = useRef<string | null>(null);

  const startBuyTrade = (customerId?: string) => {
    pendingCustomerId.current = customerId || null;
    setPinOpen(true);
  };

  const onVerified = (employee: Employee) => {
    setActingEmployeeId(employee.id);
    const params = new URLSearchParams({ from: 'buy-trade' });
    if (pendingCustomerId.current) {
      params.set('customerId', pendingCustomerId.current);
      params.set('t', String(Date.now()));
    }
    navigate(`/pos/customer?${params.toString()}`);
  };

  return { pinOpen, setPinOpen, startBuyTrade, onVerified };
}
