## Snippets

```bash
curl -X POST -d '{"a":1, "b":1}' -H 'Content-Type: application/json' http://localhost:8080/add | jq

curl -H 'Content-Type: application/json' http://localhost:8080/results | jq
```
