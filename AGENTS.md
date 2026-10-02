# Production deployment safety

- Never deploy Cloudflare Pages production with a raw `wrangler pages deploy` command.
- Never use `--branch main` for a production Direct Upload. The Cloudflare production branch is `release-production-locked`; `main` is intentionally preview-only at Cloudflare.
- Production releases must use `npm run deploy:production` from a clean checkout whose `HEAD` exactly matches `origin/main`.
- Commit and push every intended source change before building. Do not deploy an `out` directory produced by another checkout, another chat, or an uncommitted working tree.
- Preview deployments must use a non-production branch and must never be promoted implicitly.
- After deployment, verify that both the deployment URL and `https://khophim.org/release.json` report the exact candidate commit.

