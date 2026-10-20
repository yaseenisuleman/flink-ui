# syntax=docker/dockerfile:1
#
# flink-ui: the refreshed Flink web dashboard as its own container.
#
# nginx serves the built Angular app and proxies everything else to a stock
# Flink JobManager (REST API) and, under /sql-gateway/, to a Flink SQL Gateway.
# The Flink containers are not changed in any way.
#
#   docker build -t flink-ui .
#   docker run -p 8080:8080 -e FLINK_REST_URL=http://jobmanager:8081 flink-ui

FROM node:22.16.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Read by the nginx image's entrypoint, which runs envsubst on the templates
ENV FLINK_REST_URL=http://jobmanager:8081 \
    SQL_GATEWAY_URL=http://sql-gateway:8083 \
    NGINX_RESOLVER=127.0.0.11 \
    MAX_UPLOAD_SIZE=512m \
    NGINX_PORT=8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/web /usr/share/nginx/html
EXPOSE 8080
LABEL org.opencontainers.image.title="flink-ui" \
      org.opencontainers.image.source="https://github.com/yaseenisuleman/flink-ui" \
      org.opencontainers.image.description="Refreshed Flink web dashboard, served separately from Flink"
