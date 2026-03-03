FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
RUN if [ -n "$VITE_AUTH0_DOMAIN" ] && [ -n "$VITE_AUTH0_CLIENT_ID" ]; then \
      printf "VITE_AUTH0_DOMAIN=%s\nVITE_AUTH0_CLIENT_ID=%s\n" "$VITE_AUTH0_DOMAIN" "$VITE_AUTH0_CLIENT_ID" > .env.production; \
    fi && \
    npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000
ARG VITE_AUTH0_DOMAIN
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY --from=build /app/dist ./dist
EXPOSE 8000
CMD ["npm", "run", "start"]
