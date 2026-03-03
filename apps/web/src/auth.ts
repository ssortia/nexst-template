import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import type { Role } from '@repo/types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const apiUrl = process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'];

        try {
          const res = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
          });

          if (!res.ok) return null;

          const data = (await res.json()) as { accessToken: string; refreshToken: string };

          // Fetch user profile
          const userRes = await fetch(`${apiUrl}/users/me`, {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });

          if (!userRes.ok) return null;

          const user = (await userRes.json()) as { id: string; email: string; role: Role };

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token['accessToken'] = (user as { accessToken?: string }).accessToken;
        token['refreshToken'] = (user as { refreshToken?: string }).refreshToken;
        token['role'] = (user as { role?: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.role = (token['role'] as Role) ?? 'USER';
      (session as { accessToken?: string }).accessToken = token['accessToken'] as string;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
});
