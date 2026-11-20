export function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.trim(), token: token.trim() } : null;
}

export async function redisCommand<T>(command: (string | number)[]): Promise<T> {
  const config = redisConfig();
  if (!config) throw Error("Redis is unavailable");
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw Error("Redis is unavailable");
  const data = await response.json();
  if (data.error || !("result" in data)) throw Error("Redis command failed");
  return data.result as T;
}
