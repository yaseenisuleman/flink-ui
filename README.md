# flink-ui

The refreshed Flink web dashboard (Tabler-style shell, dark mode, SQL editor,
savepoints, accumulators, subtask attempts, overview trends), run as its own
container next to **stock** Flink images.

Flink is not modified. The dashboard only talks to Flink over HTTP:

```
browser ──> flink-ui (nginx :8080)
              /                 built dashboard (static files)
              /sql-gateway/...  ──> SQL Gateway REST (prefix stripped)
              everything else   ──> JobManager REST API (/overview, /jobs, /jars, ...)
```

## Origin

Taken from `flink-runtime-web/web-dashboard` on the `ui-refresh` branch of
https://github.com/yaseenisuleman/flink (commit `dc0c018413e`, based on Flink
2.3.0). From here on it is maintained in this folder only.

## Run

```sh
docker compose up --build        # stock Flink 2.3.0 + SQL Gateway + flink-ui
# open http://localhost:8080
```

Against an existing cluster:

```sh
docker build -t flink-ui .
docker run -p 8080:8080 \
  -e FLINK_REST_URL=http://<jobmanager>:8081 \
  -e SQL_GATEWAY_URL=http://<sql-gateway>:8083 \
  flink-ui
```

| Variable          | Default                     | Purpose |
|-------------------|-----------------------------|---------|
| `FLINK_REST_URL`  | `http://jobmanager:8081`    | JobManager REST API |
| `SQL_GATEWAY_URL` | `http://sql-gateway:8083`   | SQL Gateway REST API (optional; the SQL page says so when it is missing) |
| `NGINX_RESOLVER`  | `127.0.0.11`                | DNS used to resolve the two URLs per request (Docker's embedded DNS; on Kubernetes use the cluster DNS, e.g. `kube-dns.kube-system.svc.cluster.local`) |
| `MAX_UPLOAD_SIZE` | `512m`                      | Largest jar that can be uploaded |
| `NGINX_PORT`      | `8080`                      | Listen port |

Neither the Flink REST API nor the SQL Gateway has authentication. If the UI is
reachable beyond a trusted network, put auth in front of flink-ui and keep the
JobManager (8081) and gateway (8083) ports internal.

## Develop

```sh
npm ci
npm run proxy      # ng serve on :4200; proxies to localhost:8081 and /sql-gateway to localhost:8083
npm run lint
npm run build      # output in web/
```

## Flink upgrades

Change the Flink image tag; flink-ui does not need rebuilding. Only revisit the
dashboard when the REST API changes in a way the pages use, or to bring over a
new page or fix from upstream `flink-runtime-web/web-dashboard`.
