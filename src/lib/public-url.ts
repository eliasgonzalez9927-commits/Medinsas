const FALLBACK_PUBLIC_URL = "https://app.medin.com.ar";

export function getPublicAppUrl() {
  if (typeof window !== "undefined" && window.location.origin) return window.location.origin;
  return FALLBACK_PUBLIC_URL;
}

export function buildPublicUrl(path: string) {
  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
