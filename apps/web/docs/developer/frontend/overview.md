# Frontend overview

The dashboard is a React app in `apps/web`, built with Vite, TypeScript, and Tailwind. Production serves the compiled files from the same Node process as the API. In development, Vite runs on port 5173 and proxies `/api` and `/health` to port 3000.

Shared types and Zod schemas come from `@sharry/shared`. The UI components live in `apps/web/src/components/ui`.
