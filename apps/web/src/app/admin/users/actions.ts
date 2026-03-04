'use server';

import { revalidatePath } from 'next/cache';

import type { Role } from '@repo/types';

import { usersApi } from '../../../api/users.api';
import { auth } from '../../../auth';

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) throw new Error('Unauthorized');
  await usersApi.updateRole(userId, role, session.accessToken);
  revalidatePath('/admin/users');
}
