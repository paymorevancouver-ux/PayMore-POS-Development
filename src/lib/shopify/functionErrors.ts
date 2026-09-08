function headerValue(error: { context?: { headers?: { get?: (name: string) => string | null } } }, name: string): string {
  try {
    return String(error.context?.headers?.get?.(name) || '').trim();
  } catch {
    return '';
  }
}

function sanitizeFunctionError(message: string): string {
  return String(message || '')
    .replace(/shpat_[a-zA-Z0-9]+/gi, '[redacted]')
    .replace(/shpua_[a-zA-Z0-9]+/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 280);
}

export function describeEdgeFunctionError(
  functionName: string,
  error: unknown,
  data?: { error?: string; message?: string } | null,
  prefix?: string,
): string {
  const lead = prefix ? `${prefix}: ` : '';
  const body = String(data?.error || data?.message || '').trim();
  if (body && !/failed to send a request to the edge function/i.test(body)) {
    return sanitizeFunctionError(`${lead}function ${functionName}: ${body}`);
  }

  const err = (error || {}) as {
    name?: string;
    message?: string;
    context?: Response & { status?: number };
  };
  const status = Number(err.context?.status || 0);
  const code = headerValue(err, 'sb-error-code').toUpperCase();
  const raw = String(err.message || '');

  if (status === 404 || code === 'NOT_FOUND' || /failed to send a request to the edge function/i.test(raw)) {
    return sanitizeFunctionError(`${lead}function ${functionName} returned 404 — function not found.`);
  }
  if (status === 401 || code === 'UNAUTHORIZED_NO_AUTH_HEADER') {
    return sanitizeFunctionError(`${lead}function ${functionName} returned 401.`);
  }
  if (status === 403) {
    return sanitizeFunctionError(`${lead}function ${functionName} returned 403.`);
  }
  if (status === 500) {
    return sanitizeFunctionError(`${lead}function ${functionName} returned 500.`);
  }
  if (/failed to fetch|networkerror|cors/i.test(raw)) {
    return sanitizeFunctionError(`${lead}function ${functionName}: CORS or network failure.`);
  }
  if (raw) return sanitizeFunctionError(`${lead}function ${functionName}: ${raw}`);
  return sanitizeFunctionError(`${lead}function ${functionName} failed.`);
}
