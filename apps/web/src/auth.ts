import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import type { Role } from '@repo/types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function getJwtExpiry(accessToken: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(),
    ) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

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
        const u = user as { accessToken?: string; refreshToken?: string; role?: Role };
        token['accessToken'] = u.accessToken;
        token['refreshToken'] = u.refreshToken;
        token['role'] = u.role;
        token['accessTokenExpiry'] = getJwtExpiry(u.accessToken ?? '');
        return token;
      }

      // Return as-is if still valid (30s buffer before expiry)
      const expiry = token['accessTokenExpiry'] as number;
      if (expiry && Date.now() < expiry - 30_000) {
        return token;
      }

      // Access token expired — try to refresh
      const apiUrl = process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'];
      try {
        const res = await fetch(`${apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token['refreshToken'] }),
        });

        if (!res.ok) {
          return { ...token, error: 'RefreshAccessTokenError' as const };
        }

        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        token['accessToken'] = data.accessToken;
        token['refreshToken'] = data.refreshToken;
        token['accessTokenExpiry'] = getJwtExpiry(data.accessToken);
        delete token['error'];
        return token;
      } catch {
        return { ...token, error: 'RefreshAccessTokenError' as const };
      }
    },
    async session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.role = (token['role'] as Role) ?? 'USER';
      (session as { accessToken?: string }).accessToken = token['accessToken'] as string;
      if (token['error']) {
        session.error = token['error'] as 'RefreshAccessTokenError';
      }
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
