import { QueryClient, QueryFunction } from "@tanstack/react-query";

const SESSION_QUERY_CACHE_KEY = "ysp-query-cache-v1";
const SESSION_QUERY_CACHE_TTL_MS = 1000 * 60 * 30;
const MAX_QUERY_RETRIES = 2;
const MUTATION_NETWORK_RETRY_ATTEMPTS = 2;
const MUTATION_NETWORK_RETRY_DELAY_MS = 250;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

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

type ParsedResponsePayload<T = unknown> = {
  data: T | null;
  text: string;
};

async function readResponsePayload<T = unknown>(res: Response): Promise<ParsedResponsePayload<T>> {
  const text = await res.text();
  if (!text) {
    return { data: null, text: "" };
  }

  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const { data, text } = await readResponsePayload<{ error?: string; message?: string }>(res);
    const normalizedMessage =
      data?.error || data?.message || text.trim() || res.statusText || "Request failed";

    throw new Error(`${res.status}: ${normalizedMessage}`);
  }
}

function extractStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(/^(\d{3}):/);
  if (!match) {
    return null;
  }

  const statusCode = Number.parseInt(match[1], 10);
  return Number.isNaN(statusCode) ? null : statusCode;
}

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= MAX_QUERY_RETRIES) {
    return false;
  }

  const statusCode = extractStatusCode(error);
  if (statusCode !== null) {
    return RETRYABLE_STATUS_CODES.has(statusCode);
  }

  return true;
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return /failed to fetch|networkerror|load failed/i.test(error.message);
}

function waitFor(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  for (let attempt = 0; attempt <= MUTATION_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });

      await throwIfResNotOk(res);

      const payload = await readResponsePayload(res);
      return payload.data;
    } catch (error) {
      if (isTransientNetworkError(error) && attempt < MUTATION_NETWORK_RETRY_ATTEMPTS) {
        await waitFor((attempt + 1) * MUTATION_NETWORK_RETRY_DELAY_MS);
        continue;
      }

      if (isTransientNetworkError(error)) {
        throw new Error("Network error: Unable to reach the server. Please retry.");
      }

      throw error;
    }
  }

  throw new Error("Request failed after retries.");
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> => {
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);

    const payload = await readResponsePayload<T>(res);
    if (payload.data !== null) {
      return payload.data;
    }

    if (!payload.text.trim()) {
      return null as T;
    }

    throw new Error(`Expected JSON response for ${url}`);
  };
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function shouldPersistQuery(queryKey: unknown): queryKey is unknown[] {
  if (!Array.isArray(queryKey) || typeof queryKey[0] !== "string") {
    return false;
  }

  const key = queryKey[0];
  if (!key.startsWith("/api/")) {
    return false;
  }

  // Publication ordering should always come from live backend data, not restored session cache.
  if (key.startsWith("/api/publications")) {
    return false;
  }

  return true;
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

  const hadStalePublicationEntries = payload.entries.some(
    (entry) => Array.isArray(entry.queryKey) && typeof entry.queryKey[0] === "string" && entry.queryKey[0].startsWith("/api/publications"),
  );
  if (hadStalePublicationEntries) {
    writeSessionPayload({
      ...payload,
      entries: payload.entries.filter(
        (entry) => !(Array.isArray(entry.queryKey) && typeof entry.queryKey[0] === "string" && entry.queryKey[0].startsWith("/api/publications")),
      ),
    });
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
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    },
    mutations: {
      retry: false,
    },
  },
});

initializeSessionQueryPersistence(queryClient);
