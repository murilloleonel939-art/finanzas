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

# Se arrancan los DOS workers: sin `worker-precios.mjs` los jobs de la cola
# `precios_jobs` se crean pero nadie los procesa, y el botón «Actualizar precios»
# se queda esperando hasta agotar el tiempo.
CMD ["sh", "-c", "node server/migrate.mjs && (node worker-import.mjs & node worker-precios.mjs & exec node server/index.mjs)"]
