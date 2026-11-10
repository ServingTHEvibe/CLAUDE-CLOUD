# Repo notes

## Deploying
- Every project gets its **own Vercel project and its own domain**. Never put two projects on one
  Vercel project or share a domain/subdomain between them.
- Name the Vercel project after the project (e.g. `blender-product-video`), so its default domain is
  `<project-name>.vercel.app`. A custom domain, when added, belongs to that one project only.
- Team: `servingthevibe-8631s-projects`. The Claude Vercel MCP connection is **read-only** (403 on
  writes), so do all Vercel work with the **Vercel CLI**, adding `--token $VERCEL_TOKEN` to every
  command. Never print the token.
  - On the owner's computer, `VERCEL_TOKEN` is set in `~/.zshrc`.
  - In Claude cloud sessions there is no `~/.zshrc`; the real token is a network secret the proxy
    injects for `api.vercel.com`. Set a placeholder first: `export VERCEL_TOKEN=proxyinjected`
    (no hyphens; the CLI rejects them). Check with `vercel whoami --token $VERCEL_TOKEN`.
- Static sites are deployed by uploading files (`/v2/files`, then `/v13/deployments` with paths under
  the project's root directory), not by linking the repo, so one project's pushes never build another.
- Known issue: this whole repo is connected to the old Vercel project `taylormadegoodies-scrollfilm`,
  so every push to any branch triggers a failing build there. Disconnect the repo from that project
  (Settings → Git → Disconnect) and connect each project to its own Vercel project instead.

## Projects
| Project | Folder | Vercel project / domain |
|---|---|---|
| 3D product videos showcase | `site/` | `blender-product-video` → https://blender-product-video.vercel.app (Vercel Authentication still on; turn it off for public access) |
