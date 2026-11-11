/** Validate only: never return private values to Vite config/define or log values. */
export function assertFrontendEnvSafe(env) {
  const privateValues = Object.entries(env)
    .filter(([key, value]) => !key.startsWith("VITE_") && /PINATA/i.test(key) && typeof value === "string" && value.trim())
    .map(([, value]) => value.trim());
  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith("VITE_") || typeof raw !== "string" || !raw.trim()) continue;
    const value = raw.trim();
    if (/PINATA|JWT/i.test(key) || /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value) ||
        privateValues.some(secret => value.includes(secret))) {
      throw new Error("Unsafe public environment: " + key + ". Keep Pinata credentials/JWTs on the upload server only.");
    }
  }
}
