// This fallback keeps Next.js type checks usable before `cf` generates its declarations.
declare module 'cloudflare:workers' {
  export const env: unknown;
}
