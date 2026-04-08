# sip Cloudflare Worker example

This is a standalone Worker template that uses `@standardagents/sip` on the
raw request-body path.

## Local development

```bash
pnpm install
pnpm dev
```

## Deploy

```bash
pnpm install
pnpm deploy
```

The Worker serves a small HTML upload page at `/` and exposes the raw streaming
transform endpoint at `/api/process`.

This starter intentionally focuses on the low-memory JPEG and PNG paths.
