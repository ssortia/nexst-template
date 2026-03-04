'use server';

import { revalidatePath } from 'next/cache';

import type { Role } from '@repo/types';

import { auth } from '../../../auth';
import { api } from '../../../lib/api';

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) throw new Error('Unauthorized');
  await api.patch(`/users/${userId}/role`, { role }, { accessToken: session.accessToken });
  revalidatePath('/admin/users');
}
