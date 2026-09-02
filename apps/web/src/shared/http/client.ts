import type { SessionUser } from '@puk/contracts';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL;
const api = axios.create({ baseURL, withCredentials: true });
const sessionApi = axios.create({ baseURL, withCredentials: true });

interface AuthAccessors {
  acceptSession(accessToken: string, user: SessionUser): void;
  clearSession(): void;
  getAccessToken(): string | null;
}

let auth: AuthAccessors | undefined;
let refreshPromise: Promise<void> | undefined;

export function configureHttpAuth(accessors: AuthAccessors): void {
  auth = accessors;
}

api.interceptors.request.use((configuration) => {
  const token = auth?.getAccessToken();
  if (token !== null && token !== undefined)
    configuration.headers.Authorization = `Bearer ${token}`;
  return configuration;
});

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as
    (InternalAxiosRequestConfig & { retriedAfterRefresh?: boolean }) | undefined;
  const isAuthRoute =
    request?.url?.includes('/auth/login') || request?.url?.includes('/auth/refresh');
  if (
    error.response?.status !== 401 ||
    request === undefined ||
    request.retriedAfterRefresh ||
    isAuthRoute
  ) {
    throw error;
  }

  request.retriedAfterRefresh = true;
  try {
    await refreshSession();
    return api.request(request);
  } catch (refreshError) {
    auth?.clearSession();
    throw refreshError;
  }
});

export async function refreshSession(): Promise<void> {
  refreshPromise ??= sessionApi
    .post<{ data: { accessToken: string; user: SessionUser } }>('/auth/refresh')
    .then(({ data }) => auth?.acceptSession(data.data.accessToken, data.data.user))
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}

export { api };
