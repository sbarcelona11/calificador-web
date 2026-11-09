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
# PORT define el puerto en el que escucha nginx. En Render la plataforma lo inyecta
# (por defecto 10000); localmente queda en 80 (mapeado por docker-compose).
ENV PORT=80
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
