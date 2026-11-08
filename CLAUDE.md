# Repo notes

## Deploying
- Every project gets its **own Vercel project and its own domain**. Never put two projects on one
  Vercel project or share a domain/subdomain between them.
- Name the Vercel project after the project (e.g. `blender-product-video`), so its default domain is
  `<project-name>.vercel.app`. A custom domain, when added, belongs to that one project only.
- Team: `servingthevibe-8631s-projects`. The Claude Vercel connection cannot create projects (403);
  create them in the Vercel dashboard, then Claude can update them.

## Projects
| Project | Folder | Vercel project / domain |
|---|---|---|
| 3D product videos showcase | `site/` | `blender-product-video` → blender-product-video.vercel.app (not created yet) |
