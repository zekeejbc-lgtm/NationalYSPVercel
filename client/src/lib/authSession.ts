const RETRYABLE_AUTH_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_AUTH_RETRY_ATTEMPTS = 2;
const DEFAULT_AUTH_RETRY_DELAY_MS = 250;

export type AuthRole = "admin" | "chapter" | "barangay";

export interface AuthUserSession {
  id: string;
  username: string;
  role: AuthRole;
  chapterId?: string;
  chapterName?: string;
  barangayId?: string;
  barangayName?: string;
  mustChangePassword?: boolean;
}

type AuthCheckPayload = {
  authenticated?: boolean;
  user?: unknown;
  error?: string;
  message?: string;
};

type ParsedResponsePayload<T = unknown> = {
  data: T | null;
  text: string;
};

export type AuthSessionCheckResult =
  | {
      status: "authenticated";
      user: AuthUserSession;
    }
  | {
      status: "unauthenticated";
    }
  | {
      status: "error";
      message: string;
      statusCode?: number;
    };

type CheckAuthSessionOptions = {
  retryAttempts?: number;
  retryDelayMs?: number;
};

function waitFor(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return /failed to fetch|networkerror|load failed/i.test(error.message);
}

async function readResponsePayload<T = unknown>(response: Response): Promise<ParsedResponsePayload<T>> {
  const text = await response.text();
  if (!text) {
    return { data: null, text: "" };
  }

  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

function isAuthRole(role: unknown): role is AuthRole {
  return role === "admin" || role === "chapter" || role === "barangay";
}

function parseAuthUser(value: unknown): AuthUserSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const user = value as Record<string, unknown>;
  if (typeof user.id !== "string" || typeof user.username !== "string" || !isAuthRole(user.role)) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    chapterId: typeof user.chapterId === "string" ? user.chapterId : undefined,
    chapterName: typeof user.chapterName === "string" ? user.chapterName : undefined,
    barangayId: typeof user.barangayId === "string" ? user.barangayId : undefined,
    barangayName: typeof user.barangayName === "string" ? user.barangayName : undefined,
    mustChangePassword: typeof user.mustChangePassword === "boolean" ? user.mustChangePassword : undefined,
  };
}

function getErrorMessage(payload: ParsedResponsePayload<AuthCheckPayload>, fallback: string) {
  return payload.data?.error || payload.data?.message || payload.text.trim() || fallback;
}

export async function checkAuthSession(
  options: CheckAuthSessionOptions = {},
): Promise<AuthSessionCheckResult> {
  const retryAttempts = options.retryAttempts ?? DEFAULT_AUTH_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_AUTH_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const response = await fetch("/api/auth/check", {
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return { status: "unauthenticated" };
      }

      const payload = await readResponsePayload<AuthCheckPayload>(response);

      if (!response.ok) {
        if (RETRYABLE_AUTH_STATUS_CODES.has(response.status) && attempt < retryAttempts) {
          await waitFor((attempt + 1) * retryDelayMs);
          continue;
        }

        return {
          status: "error",
          statusCode: response.status,
          message: getErrorMessage(payload, `Unable to verify session (${response.status})`),
        };
      }

      if (!payload.data) {
        if (attempt < retryAttempts) {
          await waitFor((attempt + 1) * retryDelayMs);
          continue;
        }

        return {
          status: "error",
          message: "Auth check returned an invalid response.",
        };
      }

      if (!payload.data.authenticated) {
        return { status: "unauthenticated" };
      }

      const user = parseAuthUser(payload.data.user);
      if (!user) {
        if (attempt < retryAttempts) {
          await waitFor((attempt + 1) * retryDelayMs);
          continue;
        }

        return {
          status: "error",
          message: "Session is active but user details are incomplete.",
        };
      }

      return {
        status: "authenticated",
        user,
      };
    } catch (error) {
      if (isTransientNetworkError(error) && attempt < retryAttempts) {
        await waitFor((attempt + 1) * retryDelayMs);
        continue;
      }

      return {
        status: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Unable to verify session. Please retry.",
      };
    }
  }

  return {
    status: "error",
    message: "Unable to verify session after multiple attempts.",
  };
}