/** 比較用 URL 正規化。fragment と主要な tracking parameter を除去。 */
export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  for (const key of Array.from(url.searchParams.keys())) {
    if (isTrackingParameter(key)) {
      url.searchParams.delete(key);
    }
  }

  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function isTrackingParameter(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return lowerKey.startsWith("utm_") || lowerKey === "ref" || lowerKey === "source";
}
