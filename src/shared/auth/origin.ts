const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isTrustedMutationOrigin(
  request: Pick<Request, "headers" | "method" | "url">,
  allowedOrigins: readonly string[] = [],
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin || ![requestOrigin, ...allowedOrigins].includes(origin)) {
    return false;
  }

  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "same-site";
}

export function requireTrustedMutationOrigin(
  request: Pick<Request, "headers" | "method" | "url">,
  allowedOrigins: readonly string[] = [],
): void {
  if (!isTrustedMutationOrigin(request, allowedOrigins)) {
    throw new Error("UNTRUSTED_MUTATION_ORIGIN");
  }
}

