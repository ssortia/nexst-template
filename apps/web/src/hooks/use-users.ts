'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import type { Role } from '@repo/types';

import { usersApi } from '../api/users.api';

/** Хук для получения списка пользователей (только для ADMIN). */
export function useUsers() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(session!.accessToken!),
    enabled: !!session?.accessToken,
  });
}

/** Хук для изменения роли пользователя с автоматической инвалидацией кэша. */
export function useUpdateRole() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      usersApi.updateRole(userId, role, session!.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
