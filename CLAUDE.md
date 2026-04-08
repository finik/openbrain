# Open Brain MCP — Project Notes

## Deployment

Deploy the Supabase edge function with `--no-verify-jwt` — this is required because the function uses its own custom auth (`x-brain-key` header) instead of Supabase JWTs. Without this flag, Supabase rejects requests at the gateway before they reach the function.

```bash
supabase functions deploy open-brain-mcp --no-verify-jwt
```
