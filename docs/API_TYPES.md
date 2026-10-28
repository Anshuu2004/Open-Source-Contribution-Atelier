# Typed API responses (frontend)

`frontend/src/types/api.d.ts` is generated from the Django OpenAPI schema
(drf-spectacular) by `openapi-typescript`. Do not edit it by hand.

## Regenerating

```bash
cd frontend
npm run generate:api          # exports the schema straight from Django (needs the backend deps installed)
npm run generate:api:server   # alternative: reads http://127.0.0.1:8000/api/schema/ from a running server
```

Commit the updated `src/types/api.d.ts`. The `API Types Freshness` workflow
regenerates it on PRs and reports a diff if it is stale.

## Using the types

- `apiGet("/api/chat/rooms/{room_id}/messages/", { pathParams: { room_id } })`
  returns the schema's 200 JSON body type. Paths, path params and query params
  are checked against the schema.
- `fetchApi<T>(endpoint, options)` takes an explicit response type `T` for
  endpoints the schema does not describe well (default `any`, so existing
  callers are unaffected). Write a small interface next to the hook and add a
  short comment saying why the schema type is not used.
- `ApiError` is unchanged.
- `@typescript-eslint/no-explicit-any` is `warn` for `src/hooks`.
