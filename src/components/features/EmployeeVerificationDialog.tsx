import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PinPad from '@/components/features/PinPad';
import { useAuthStore } from '@/stores/authStore';
import { canPerformBuyTrade, findActiveEmployeeByPin } from '@/lib/employeePin';
import type { Employee } from '@/types';

interface EmployeeVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (employee: Employee) => void;
}

export default function EmployeeVerificationDialog({
  open,
  onOpenChange,
  onVerified,
}: EmployeeVerificationDialogProps) {
  const employees = useAuthStore((s) => s.employees);
  const [error, setError] = useState('');

  const handleSubmit = (pin: string) => {
    const emp = findActiveEmployeeByPin(employees, pin);
    if (!emp) {
      setError('Invalid PIN. Please try again.');
      return;
    }
    if (!canPerformBuyTrade(emp.role)) {
      setError('You do not have permission to start a Buy / Trade transaction.');
      return;
    }
    setError('');
    onOpenChange(false);
    onVerified(emp);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setError('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[16px]">Employee Verification</DialogTitle>
          <DialogDescription className="text-[13px]">
            Enter your PIN to start a Buy / Trade transaction
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center pt-1">
          {open && (
            <PinPad
              onSubmit={handleSubmit}
              error={error}
              submitLabel="Continue"
              showKeypad
            />
          )}
          <Button variant="outline" className="w-full max-w-[280px] mt-2 h-10" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
