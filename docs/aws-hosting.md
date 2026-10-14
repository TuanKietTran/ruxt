# AWS hosting and routing

Ruxt has a validation deployment on AWS in `us-east-1`.

- Instance: `i-02beba17e05929555` (`t4g.small`)
- Elastic IP: `3.220.224.155`
- Security group: `sg-0ea649de5465f5e8f` (TCP 80/443)
- Health check: `http://3.220.224.155/api/health` returns HTTP 200
- Storage: local filesystem on the instance; this is a validation deployment, not yet a durable production data tier.

The existing Cloudflare record for `ruxt.mashallow.cloud` is an unproxied CNAME to `alias.deno.net`. DNS was not changed during AWS validation.

## Switching routing

The AWS target is currently an Elastic IP, so it remains stable across instance restarts. A switch to AWS requires changing the Cloudflare record from the current CNAME to an A record:

```text
ruxt.mashallow.cloud  A  3.220.224.155
```

Switching back requires restoring:

```text
ruxt.mashallow.cloud  CNAME  alias.deno.net
```

These are production DNS changes and require explicit review/confirmation before applying. The AWS origin currently serves HTTP; configure and verify TLS/Cloudflare proxy settings before routing public HTTPS traffic to it.
