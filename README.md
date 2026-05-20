# Elf Destiny Wiki

Source for the [Elf Destiny Wiki](https://galacticliaison.github.io/elf-destiny-wiki/) —
a community wiki for the Elf Destiny mods for Crusader Kings III and Europa
Universalis V.

Built with [MkDocs](https://www.mkdocs.org/) and the
[Material theme](https://squidfunk.github.io/mkdocs-material/). Pages are plain
Markdown in `docs/`. Every push to `main` rebuilds and publishes the site via GitHub
Pages.

## Structure

- `docs/lore/` — shared world lore.
- `docs/ck3/` — Crusader Kings III mod gameplay mechanics.
- `docs/eu5/` — Europa Universalis V mod gameplay mechanics.
- `docs/assets/images/` — converted PNG images for use in wiki pages.
- `mkdocs.yml` — site config and navigation.

## Editing

- **Lore pages** are authored and polished in the `Public Facing Lore` folder of the
  `elf-destiny-lore-master` repo, then copied into `docs/lore/`.
- **Mechanics pages** are written directly under `docs/ck3/` and `docs/eu5/`.

## Building locally

```
pip install -r requirements.txt
mkdocs serve
```

Then open <http://127.0.0.1:8000>. Run `mkdocs build --strict` to catch broken links
before pushing.

## Adding images

Wiki images live in `docs/assets/images/`, organised by mod and category. The mod
source files are `.dds` (DirectX texture format) and must be converted to PNG before
they can display in a browser.

**Prerequisite:** ImageMagick must be installed (`winget install ImageMagick.ImageMagick`).
After installation, open a new terminal and `magick --version` should work. The full
path fallback is `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe`.

### Converting a CK3 mod DDS file

```powershell
$MAGICK = "C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"
$SRC_CK3 = "C:\Users\Tirith\Documents\Paradox Interactive\Crusader Kings III\mod\Elf Destiny\gfx"

& $MAGICK "$SRC_CK3\interface\illustrations\men_at_arms_big\fey_archers.dds" `
          "docs\assets\images\ck3\units\fey_archers.png"
```

**CK3 DDS source folders and wiki destinations:**

| Category | Source path under `gfx/` | Wiki destination |
|---|---|---|
| Unit art (large) | `interface/illustrations/men_at_arms_big/` | `ck3/units/` |
| Unit art (small) | `interface/illustrations/men_at_arms_small/` | `ck3/units/` |
| Activity backgrounds | `interface/illustrations/activity_backgrounds/` | `ck3/activities/` |
| Decision illustrations | `interface/illustrations/decisions/` | `ck3/decisions/` |
| Event theme art | `interface/illustrations/event_themes/` | `ck3/events/` |
| Trait icons | `interface/icons/traits/` | `ck3/traits/` |
| Culture tradition icons | `interface/icons/culture_tradition/4-items/` | `ck3/traditions/` |

### Converting an EU5 mod DDS file

```powershell
$MAGICK = "C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"
$SRC_EU5 = "C:\Users\Tirith\Documents\Paradox Interactive\Europa Universalis V\mod\Elf Destiny\main_menu\gfx"

& $MAGICK "$SRC_EU5\interface\illustrations\event\backgrounds\portal_broken.dds" `
          "docs\assets\images\eu5\events\portal_broken.png"
```

**EU5 DDS source folders and wiki destinations:**

| Category | Source path under `main_menu/gfx/` | Wiki destination |
|---|---|---|
| Event illustrations | `interface/illustrations/event/backgrounds/` | `eu5/events/` |
| Unit art | `interface/illustrations/units/` | `eu5/units/` |
| Building icons | `interface/icons/buildings/` | `eu5/buildings/` |
| Trait/tier icons | `interface/icons/traits/` | `eu5/traits/` |
| Modifier icons | `interface/icons/modifiers/` | `eu5/modifiers/` |

### Downloading a Steam/imgur screenshot

```powershell
Invoke-WebRequest -Uri "https://i.imgur.com/XXXXXX.jpg" `
                  -OutFile "docs\assets\images\steam\name.jpg"
```

### Referencing images in Markdown

```markdown
![Fey Archers unit art](../assets/images/ck3/units/fey_archers.png)
```

Adjust the relative path depth (`../` vs `../../`) depending on how deep in `docs/`
the page sits. Pages at `docs/ck3/` use `../assets/...`; pages at `docs/` root use
`assets/...`.

### When to add images

Add an image when it meaningfully illustrates the content — a unit illustration on a
units page, a decision background on the decisions page, an event scene on a lore
page. Aim for one or two images per page section; the wiki is documentation, not a
gallery. Prefer large illustrations (men_at_arms_big, event backgrounds, decisions)
over small icons.

## Infrastructure

Most of the wiki is static — Markdown rendered by MkDocs and served by GitHub Pages.
Two features go beyond that:

- **Suggest an edit** — highlight any text on a page and the floating tooltip lets
  a Discord-authenticated reader file a wiki improvement, which opens as a GitHub
  issue and cross-posts to that page's GitHub Discussion.
- **Report a mod bug** — a page-footer button and a second highlight-tooltip
  button file tagged threads directly into the community Discord's
  `#error-reports` forum channel, pinging the reporter.

Both flows share a single Cloudflare Worker at
[cloudflare/worker.js](cloudflare/worker.js). The worker handles Discord OAuth
(guild membership is verified), then either creates a GitHub issue or — using the
Discord application's bot token — creates a forum thread via Discord's REST API.
The Discord bot project (`elf-destiny-discord-bot`) is not in the request path;
the worker calls Discord directly.

### Wrangler config and auto-deploy

- [cloudflare/wrangler.toml](cloudflare/wrangler.toml) — worker config (name,
  account, compatibility date).
- [.github/workflows/deploy-worker.yml](.github/workflows/deploy-worker.yml) —
  GitHub Action that runs `wrangler deploy` on every push to `main` that
  touches `cloudflare/**`. Uses the `CLOUDFLARE_API_TOKEN` repo secret.
- The existing [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
  rebuilds the static site on the same push. Both workflows run in parallel.

### Required secrets

| Where | Name | Source |
|---|---|---|
| Cloudflare Worker | `GITHUB_PAT` | Fine-grained PAT, Issues + Discussions read/write on this repo |
| Cloudflare Worker | `DISCORD_CLIENT_SECRET` | Discord application → OAuth2 |
| Cloudflare Worker | `DISCORD_BOT_TOKEN` | Same Discord application → Bot; needs Send Messages in Threads + Create Public Threads on `#error-reports` |
| GitHub repo | `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template |

### Local worker workflow

```powershell
cd cloudflare

# Deploy manually (CI does this automatically on push)
npx wrangler deploy

# Stream live worker logs
npx wrangler tail

# Set or rotate a secret
npx wrangler secret put DISCORD_BOT_TOKEN
```

First time only: `npx wrangler login` (browser-based OAuth to Cloudflare).

### Where the dynamic JS lives

| File | Role |
|---|---|
| [docs/assets/javascripts/suggest-edit.js](docs/assets/javascripts/suggest-edit.js) | Selection tooltip + suggest-edit modal |
| [docs/assets/javascripts/bug-report.js](docs/assets/javascripts/bug-report.js) | Bug-report modal, called from both the footer button and the tooltip |
| [overrides/partials/bug-report-button.html](overrides/partials/bug-report-button.html) | The page-footer button itself |
| [overrides/partials/comments.html](overrides/partials/comments.html) | Includes the bug-report partial + the existing Giscus comments embed |

### After a wiki-side JS change

Readers' browsers cache the previous JS aggressively. After deploying a
suggest-edit or bug-report change, a hard refresh (`Ctrl + F5`) is usually
needed before the new behavior shows up.

## How this fits with the other Elf Destiny projects

The wiki is one of four repos in the Elf Destiny ecosystem. See `ECOSYSTEM.md`
in the local `elf-destiny-lore-master` repo (typically at
`c:\projects\elf-destiny-lore-master\ECOSYSTEM.md`) for the full picture of how
content flows from the mod source files, through lore-master, into the wiki —
and how bug reports flow from both Discord and the wiki into the
`#error-reports` forum.
