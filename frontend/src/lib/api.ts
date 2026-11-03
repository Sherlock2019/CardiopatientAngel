import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

const TOKEN_KEY = "cw_token";

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Params = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, init: RequestInit & { params?: Params } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path + qs(init.params), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : msg;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event("cw-logout"));
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export function useApi<T>(
  key: unknown[],
  path: string,
  params?: Params,
  opts?: Partial<UseQueryOptions<T>>,
) {
  return useQuery<T>({
    queryKey: [...key, params ?? {}],
    queryFn: () => api<T>(path, { params }),
    ...opts,
  });
}
