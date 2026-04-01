import { QueryClient, QueryFunction } from "@tanstack/react-query";

const SESSION_QUERY_CACHE_KEY = "ysp-query-cache-v1";
const SESSION_QUERY_CACHE_TTL_MS = 1000 * 60 * 30;

type SessionQueryCacheEntry = {
  queryKey: unknown[];
  data: unknown;
  updatedAt: number;
};

type SessionQueryCachePayload = {
  version: 1;
  savedAt: number;
  entries: SessionQueryCacheEntry[];
};

let sessionPersistenceInitialized = false;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await res.json();
  }
  
  return null;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function shouldPersistQuery(queryKey: unknown): queryKey is unknown[] {
  return Array.isArray(queryKey) && typeof queryKey[0] === "string" && queryKey[0].startsWith("/api/");
}

function readSessionPayload(): SessionQueryCachePayload | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_QUERY_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SessionQueryCachePayload;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeSessionPayload(payload: SessionQueryCachePayload) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_QUERY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/serialization failures and continue without persistence.
  }
}

function restoreQueryCacheFromSession(client: QueryClient) {
  const payload = readSessionPayload();
  if (!payload) {
    return;
  }

  const now = Date.now();
  for (const entry of payload.entries) {
    if (!shouldPersistQuery(entry.queryKey)) {
      continue;
    }

    if (typeof entry.updatedAt !== "number") {
      continue;
    }

    if (now - entry.updatedAt > SESSION_QUERY_CACHE_TTL_MS) {
      continue;
    }

    client.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt });
  }
}

function persistQueryCacheToSession(client: QueryClient) {
  if (!canUseSessionStorage()) {
    return;
  }

  const now = Date.now();
  const entries: SessionQueryCacheEntry[] = [];

  for (const query of client.getQueryCache().findAll()) {
    if (!shouldPersistQuery(query.queryKey)) {
      continue;
    }

    if (query.state.status !== "success" || query.state.data === undefined) {
      continue;
    }

    const updatedAt = query.state.dataUpdatedAt || now;
    if (now - updatedAt > SESSION_QUERY_CACHE_TTL_MS) {
      continue;
    }

    entries.push({
      queryKey: query.queryKey as unknown[],
      data: query.state.data,
      updatedAt,
    });
  }

  writeSessionPayload({
    version: 1,
    savedAt: now,
    entries,
  });
}

function initializeSessionQueryPersistence(client: QueryClient) {
  if (sessionPersistenceInitialized || !canUseSessionStorage()) {
    return;
  }

  sessionPersistenceInitialized = true;
  restoreQueryCacheFromSession(client);

  let timeoutId: number | null = null;

  const schedulePersist = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      persistQueryCacheToSession(client);
    }, 200);
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event?.type === "updated" || event?.type === "added" || event?.type === "removed") {
      schedulePersist();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    persistQueryCacheToSession(client);
    unsubscribe();
  }, { once: true });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      staleTime: 0,
      gcTime: SESSION_QUERY_CACHE_TTL_MS,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

initializeSessionQueryPersistence(queryClient);
