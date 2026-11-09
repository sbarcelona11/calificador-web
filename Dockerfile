# Etapa 1: arma dist/index.html (instala dependencias y empaqueta)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY build.js ./
COPY src ./src
RUN node build.js

# Etapa 2: sirve el HTML estatico
FROM nginx:1.27-alpine
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 80
