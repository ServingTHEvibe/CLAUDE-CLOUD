# Repo notes

## Deploying
- Every project gets its **own Vercel project and its own domain**. Never put two projects on one
  Vercel project or share a domain/subdomain between them.
- Name the Vercel project after the project (e.g. `blender-product-video`), so its default domain is
  `<project-name>.vercel.app`. A custom domain, when added, belongs to that one project only.
- Team: `servingthevibe-8631s-projects`. The Claude Vercel connection is **read-only**: creating,
  updating and deploying all return 403. Do Vercel changes in the dashboard.
- Known issue: this whole repo is connected to the old Vercel project `taylormadegoodies-scrollfilm`,
  so every push to any branch triggers a failing build there. Disconnect the repo from that project
  (Settings → Git → Disconnect) and connect each project to its own Vercel project instead.

## Projects
| Project | Folder | Vercel project / domain |
|---|---|---|
| 3D product videos showcase | `site/` | `blender-product-video` → blender-product-video.vercel.app (not created yet) |
