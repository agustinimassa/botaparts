FROM mcr.microsoft.com/playwright:v1.57.0-jammy AS build

WORKDIR /app

# Instalar deps (incluye dev para compilar TS)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Compilar
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev


FROM mcr.microsoft.com/playwright:v1.57.0-jammy AS runner

WORKDIR /app

ENV NODE_ENV=production
# En la imagen de Playwright los browsers viven en /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Persistencia local/Render: montar volumen en /app/storage si querés conservar archivos.
RUN mkdir -p /app/storage

EXPOSE 3000

CMD ["node", "dist/index.js"]

# syntax=docker/dockerfile:1

# Playwright official image includes Chromium + required system deps.
# Version is pinned to match package.json playwright dependency.
FROM mcr.microsoft.com/playwright:v1.46.1-jammy AS builder

WORKDIR /app

# Install deps (includes devDeps for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies for a smaller runtime image
RUN npm prune --omit=dev


FROM mcr.microsoft.com/playwright:v1.46.1-jammy AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist

# Storage folder for previews/data (can be mounted as volume)
RUN mkdir -p /app/storage

EXPOSE 3000

CMD ["node", "dist/index.js"]


