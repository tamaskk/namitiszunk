# Deploy configuration

Read by the deploy skill. Values only, never secrets. Any value still in [brackets]: the skill stops and asks.

| Key | Value |
| --- | --- |
| Platform | Vercel Pro, function region `fra1` |
| Vercel projects | [5 projects, names set in T-014]: landing (apps/landing), order (apps/order), admin (apps/admin), hq (apps/hq), api (apps/api) |
| Deploy method | Git integration: pull request → preview, merge to main → production; `turbo-ignore` builds only changed apps |
| Production branch | main |
| Production URLs | https://namitiszunk.hu · https://rendel.namitiszunk.hu · https://admin.namitiszunk.hu · https://hq.namitiszunk.hu · https://api.namitiszunk.hu |
| Preview URLs | created per pull request by Vercel |
| Smoke checks | `curl -sSf https://api.namitiszunk.hu/v1/health` [health route created in T-029]; each app's home page returns 200 |
| Required env vars (names) | see docs/ARCHITECTURE.md §09; set in Vercel, never here |
| Rollback | Vercel dashboard → project → Deployments → previous deployment → Promote, or `vercel rollback` |
| Deploy window | weekdays during the day; never Friday–Saturday 18:00–06:00 Budapest time |
| Who deploys production | only the user; Claude prepares and verifies |
