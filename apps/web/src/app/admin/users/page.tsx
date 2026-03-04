import type { User } from '@repo/types';

import { auth } from '../../../auth';
import { api } from '../../../lib/api';

import { RoleSelect } from './role-select';

export default async function AdminUsersPage() {
  const session = await auth();
  const accessToken = session?.accessToken ?? '';

  let users: User[] = [];
  let error: string | null = null;
  try {
    users = await api.get<User[]>('/users', { accessToken });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Не удалось загрузить пользователей';
  }

  const currentAdminId = session?.user.id ?? '';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Пользователи</h2>
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Роль</th>
                <th className="px-4 py-3 text-left font-medium">Дата регистрации</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground px-4 py-6 text-center">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {user.email}
                      {user.id === currentAdminId && (
                        <span className="text-muted-foreground ml-2 text-xs">(вы)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        userId={user.id}
                        currentRole={user.role}
                        currentAdminId={currentAdminId}
                      />
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {new Date(user.createdAt).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
