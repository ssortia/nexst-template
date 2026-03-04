import type { Role, User } from '@repo/types';

import { api } from '../lib/api';

/** Доменные функции для users-эндпоинтов. Без React, без хуков — чистые async-функции. */
export const usersApi = {
  me: (accessToken: string) => api.get<User>('/users/me', { accessToken }),

  list: (accessToken: string) => api.get<User[]>('/users', { accessToken }),

  updateRole: (userId: string, role: Role, accessToken: string) =>
    api.patch<User>(`/users/${userId}/role`, { role }, { accessToken }),
};
