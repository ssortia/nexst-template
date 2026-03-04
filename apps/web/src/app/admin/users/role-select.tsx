'use client';

import { useTransition } from 'react';

import type { Role } from '@repo/types';

import { updateUserRole } from './actions';

interface RoleSelectProps {
  userId: string;
  currentRole: Role;
  currentAdminId: string;
}

export function RoleSelect({ userId, currentRole, currentAdminId }: RoleSelectProps) {
  const [isPending, startTransition] = useTransition();
  const isSelf = userId === currentAdminId;

  return (
    <select
      defaultValue={currentRole}
      disabled={isSelf || isPending}
      onChange={(e) => {
        const role = e.target.value as Role;
        startTransition(() => void updateUserRole(userId, role));
      }}
      className="border-input bg-background focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:ring-2 disabled:opacity-50"
    >
      <option value="USER">USER</option>
      <option value="ADMIN">ADMIN</option>
    </select>
  );
}
