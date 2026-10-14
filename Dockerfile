FROM node:22-alpine

# El worker convierte PDF, CSV y Excel a texto antes de enviarlos a Pateway Claude.
RUN apk add --no-cache poppler-utils

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Coolify ejecuta la migración en cada arranque del contenedor. Si falla, no
# arranca ni la API ni los workers; las migraciones son idempotentes.
# Ambos workers deben arrancar después para procesar importaciones y precios.
CMD ["sh", "-c", "npm run db:migrate && (node worker-import.mjs & node worker-precios.mjs & exec node server/index.mjs)"]
