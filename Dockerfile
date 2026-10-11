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

CMD ["sh", "-c", "node server/migrate.mjs && (node worker-import.mjs & exec node server/index.mjs)"]
