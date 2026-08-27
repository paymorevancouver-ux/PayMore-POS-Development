import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PinPad from '@/components/features/PinPad';
import { useAuthStore } from '@/stores/authStore';
import { canPerformBuyTrade, verifyEmployeeForAction } from '@/lib/employeePin';
import type { Employee, EmployeeRole } from '@/types';

interface EmployeeVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (employee: Employee) => void;
  title?: string;
  description?: string;
  permissionCheck?: (role: EmployeeRole) => boolean;
  permissionDeniedMessage?: string;
}

export default function EmployeeVerificationDialog({
  open,
  onOpenChange,
  onVerified,
  title = 'Employee Verification',
  description = 'Enter your PIN to start a Buy / Trade transaction',
  permissionCheck = canPerformBuyTrade,
  permissionDeniedMessage = 'You do not have permission to start a Buy / Trade transaction.',
}: EmployeeVerificationDialogProps) {
  const employees = useAuthStore((s) => s.employees);
  const [error, setError] = useState('');

  const handleSubmit = (pin: string) => {
    const result = verifyEmployeeForAction(employees, pin, permissionCheck);
    if (!result.ok) {
      setError(
        result.reason === 'permission'
          ? permissionDeniedMessage
          : 'Invalid PIN. Please try again.',
      );
      return;
    }
    setError('');
    onVerified(result.employee);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setError('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{title}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {description}
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
