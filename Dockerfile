FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/install-hooks.mjs ./scripts/install-hooks.mjs
# ponytail: dev deps kept — start uses tsx and migrate uses drizzle-kit; prune once the server is compiled to JS
RUN npm ci
COPY . .
RUN npm run build
# Cloud Run injects PORT (8080); compose sets 3000. NODE_ENV comes from the runtime, not the image.
EXPOSE 3000
# Migrations run on every cold start; exec so the server gets SIGTERM directly.
CMD ["sh", "-c", "npm run db:migrate && exec npm start"]
