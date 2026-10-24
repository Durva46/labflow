import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiEnvelope, ApiListEnvelope } from '../types';

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || '/api/v1';

let csrfToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let onForbidden: (() => void) | null = null;
let onRateLimited: (() => void) | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function registerAuthHandlers(handlers: {
  onUnauthenticated: () => void;
  onForbidden: () => void;
  onRateLimited: () => void;
}) {
  onUnauthenticated = handlers.onUnauthenticated;
  onForbidden = handlers.onForbidden;
  onRateLimited = handlers.onRateLimited;
}

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

function isStateChanging(method?: string): boolean {
  if (!method) return false;
  const value = method.toUpperCase();
  return value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE';
}

api.interceptors.request.use((config) => {
  if (isStateChanging(config.method) && csrfToken) {
    config.headers = config.headers ?? {};
    if (typeof (config.headers as Record<string, string>).set === 'function') {
      (config.headers as Headers).set('X-CSRF-Token', csrfToken);
    } else {
      (config.headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

export interface NormalisedError {
  code: string;
  message: string;
  details?: unknown;
  status?: number;
}

function normaliseError(error: unknown): NormalisedError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    const body = axiosError.response?.data;
    if (body && typeof body === 'object' && 'error' in body && body.error) {
      return {
        code: body.error.code,
        message: body.error.message || 'Request failed',
        details: body.error.details,
        status: axiosError.response?.status,
      };
    }
    const status = axiosError.response?.status;
    if (status === 401) {
      return {
        code: 'UNAUTHENTICATED',
        message: 'Your session has expired. Sign in again.',
        status,
      };
    }
    if (status === 403) {
      return {
        code: 'FORBIDDEN',
        message: 'You do not have permission.',
        status,
      };
    }
    if (status === 429) {
      return {
        code: 'RATE_LIMITED',
        message: 'Too many attempts, try again later.',
        status,
      };
    }
    if (status === 413) {
      return {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The file is too large.',
        status,
      };
    }
    return {
      code: status ? `HTTP_${status}` : 'NETWORK_ERROR',
      message: axiosError.message || 'Request failed',
      status,
    };
  }
  if (error instanceof Error) {
    return { code: 'ERROR', message: error.message };
  }
  return { code: 'ERROR', message: 'Request failed' };
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalised = normaliseError(error);
    const status = error && axios.isAxiosError(error) ? error.response?.status : normalised.status;

    if (status === 401) {
      const url = typeof error?.config?.url === 'string' ? error.config.url : '';
      if (!url.includes('/auth/login') && !url.includes('/auth/csrf')) {
        onUnauthenticated?.();
      }
    } else if (status === 403) {
      onForbidden?.();
    } else if (status === 429) {
      onRateLimited?.();
    }

    return Promise.reject(normalised);
  },
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<ApiEnvelope<T> | T>(url, config);
  const body = response.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

export async function apiGetList<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const response = await api.get<ApiListEnvelope<T>>(url, config);
  return response.data;
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<ApiEnvelope<T> | T>(url, body, config);
  const data = response.data;
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as ApiEnvelope<T>).data;
  }
  return data as T;
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.patch<ApiEnvelope<T> | T>(url, body, config);
  const data = response.data;
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as ApiEnvelope<T>).data;
  }
  return data as T;
}

export async function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.put<ApiEnvelope<T> | T>(url, body, config);
  const data = response.data;
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as ApiEnvelope<T>).data;
  }
  return data as T;
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  if (config?.responseType === 'blob') {
    const response = await api.delete(url, config);
    return response.data as T;
  }
  const response = await api.delete<ApiEnvelope<T> | T>(url, config);
  if (response.status === 204) {
    return undefined as T;
  }
  const data = response.data;
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as ApiEnvelope<T>).data;
  }
  return data as T;
}

export async function apiRequestBlob(
  url: string,
  config: AxiosRequestConfig = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await api.get(url, { ...config, responseType: 'blob' });
  const blob = response.data as Blob;
  const disposition = response.headers['content-disposition'];
  let filename: string | null = null;
  if (typeof disposition === 'string') {
    const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(disposition);
    if (match && match[1]) {
      try {
        filename = decodeURIComponent(match[1]);
      } catch {
        filename = match[1];
      }
    }
  }
  return { blob, filename };
}

export { api };
export type { NormalisedError };
