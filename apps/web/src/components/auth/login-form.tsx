'use client';

import { useState } from 'react';

import { TextField, ZodForm } from '@ssortia/shadcn-zod-bridge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginDtoSchema } from '@repo/types';
import type { LoginDto } from '@repo/types';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(data: LoginDto) {
    setServerError(null);

    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setServerError('Неверный email или пароль');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Введите email и пароль для доступа</CardDescription>
      </CardHeader>
      <CardContent>
        <ZodForm schema={LoginDtoSchema} onSubmit={onSubmit} className="space-y-4">
          <TextField name="email" label="Email" type="email" placeholder="admin@example.com" required />
          <TextField name="password" label="Пароль" type="password" placeholder="••••••••" required />
          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}
          <Button type="submit" className="w-full">Войти</Button>
        </ZodForm>
      </CardContent>
    </Card>
  );
}
