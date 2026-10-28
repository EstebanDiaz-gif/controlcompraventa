# Servidor de pagos de Pekeron. Este archivo lo completa solo la publicación automática (.github/workflows/pagos.yml).
name = "pekeron-pagos"
main = "src/index.js"
compatibility_date = "2025-01-01"
workers_dev = true

[vars]
FB_PROJECT = "controlcompraventa"
FB_API_KEY = "AIzaSyDvPJSTst4xGQtzIegLkpftpi7sN6r78b4"
ORIGINS = "https://pekeronapp.com,https://www.pekeronapp.com,https://estebandiaz-gif.github.io,http://localhost:8766"
OWNER_UIDS = "MgqYIhoyV2gHVluyQBtz8A3LZsw1,w2jqVcijMyOytIdFqw2lPhPxQxr1"

[[kv_namespaces]]
binding = "MP"
id = "__KV_ID__"
