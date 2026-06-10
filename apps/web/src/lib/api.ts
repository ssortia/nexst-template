import type { ApiErrorBody } from '@repo/types';

import { env } from './env';

// На сервере — API_URL (внутренняя сеть/docker), на клиенте — NEXT_PUBLIC_API_URL
const API_BASE = typeof window === 'undefined' ? env.API_URL : env.NEXT_PUBLIC_API_URL;

type RequestOptions = RequestInit & {
  accessToken?: string;
  /** Query-параметры для GET-запросов. Undefined-значения игнорируются. */
  params?: Record<string, string | undefined>;
};

/** Типизированная HTTP-ошибка со статус-кодом для удобной обработки в UI. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Отдельные сообщения валидации из тела ответа (если есть). */
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Проверка, что распарсенное тело соответствует контракту ApiErrorBody. */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['message'] === 'string'
  );
}

/**
 * Приводит неуспешный ответ к ApiError: сначала пытается распарсить тело по
 * контракту ApiErrorBody (чистый message + опциональные details), при неуспехе —
 * фолбэк на сырой текст ответа.
 */
async function parseApiError(res: Response): Promise<ApiError> {
  const raw = await res.text();

  try {
    const body: unknown = JSON.parse(raw);
    if (isApiErrorBody(body)) {
      return new ApiError(res.status, body.message, body.details);
    }
  } catch {
    // Тело не JSON или не по контракту — используем фолбэк ниже.
  }

  return new ApiError(res.status, raw || `HTTP ${res.status}`);
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, params, ...fetchOptions } = options;

  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, value);
    }
    const qs = search.toString();
    if (qs) path = `${path}?${qs}`;
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...fetchOptions.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    throw await parseApiError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
