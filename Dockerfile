# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json ./
# bookworm-slim ships npm 10, but package-lock.json is authored by npm 11. Optional-dependency
# resolution differs across npm majors, so `npm ci` with npm 10 against an npm-11 lockfile
# fails with spurious "Missing … from lock file" errors (esbuild/@emnapi). Pin npm to match.
# postgres.js and pglite are pure JS — no native toolchain needed.
RUN npm install -g npm@11.6.2 && npm ci

# --- builder ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production

# LibreOffice (DOCX->PDF) and poppler (pdfinfo for page counting).
RUN apt-get update && apt-get install -y \
      libreoffice-writer poppler-utils fontconfig \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Next standalone output + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Runtime-read files: migrations (applied at startup) + the resume-skill default.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/spec ./spec

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
