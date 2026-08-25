/**
 * Environment variables loaded by Vite.
 * Vite only exposes vars prefixed with VITE_ to the browser.
 * Create a .env file in the project root (see .env.example).
 */
function defineEnv() {
  const baseUrl = import.meta.env.VITE_TRUEFORGE_BASE_URL ?? 'http://localhost:8790'
  const token = import.meta.env.VITE_TRUEFORGE_TOKEN ?? ''
  return { TRUEFORGE_BASE_URL: baseUrl as string, TRUEFORGE_TOKEN: token as string } as const
}
export { defineEnv }
