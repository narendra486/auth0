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

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8000
CMD ["nginx", "-g", "daemon off;"]
