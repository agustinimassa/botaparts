# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.57.0-jammy AS build

WORKDIR /app

# Instalar deps (incluye dev para compilar TS)
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

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
