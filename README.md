# Jesper.live

A personal gaming site with two playable browser games, built entirely with vanilla HTML, CSS and JavaScript. No frameworks, no build step, no backend — just static files.

## Games

- **CS Case Clicker** (`/cs-case-clicker/`) — an idle clicker themed around CS2 cases. Click to earn Euros, buy cases, and each case permanently boosts your earnings per click. Includes anti-autoclicker protection (rate limiting, randomized cooldowns, randomized hitbox) and localStorage save.
- **Chess** (`/chess/`) — full chess implementation: legal move highlighting, castling, en passant, pawn promotion picker, check/checkmate/stalemate detection, move history in algebraic notation, captured pieces panel. Play local 2-player or against a built-in minimax AI.

## Structure

```
index.html                  Landing page
style.css                   Shared global styles
privacy.html                Privacy policy (required for AdSense)
ads.txt                     AdSense seller verification
robots.txt / sitemap.xml    SEO
cs-case-clicker/index.html  Game 1 (self-contained)
chess/index.html            Game 2 (self-contained)
assets/                     Static assets
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Select this repository.
4. Build settings: leave **Build command** empty and set **Build output directory** to `/` (it's a plain static site).
5. Deploy, then add your custom domain (`jesper.live`) under **Custom domains**.

GitHub Pages works too: **Settings → Pages → Deploy from branch**, pick your branch and `/ (root)`.

## Google AdSense setup

AdSense is fully wired in with publisher ID `ca-pub-4854590447352624` and ad unit `7531125407`:

- The AdSense loader script is in the `<head>` of the homepage and both game pages.
- Each of those pages has one responsive display ad unit (`<ins class="adsbygoogle">`).
- `/ads.txt` contains the matching `pub-4854590447352624` entry and must be reachable at `https://jesper.live/ads.txt` after deploy.

To add more ad placements, create additional ad units in AdSense → Ads → By ad unit and copy the new `data-ad-slot` value into a new `<ins>` block.

### If AdSense rejects the site ("low value content" / "site not ready")

Common causes and what this repo already does about them:

- **Missing privacy policy** → `privacy.html` is included and linked in every footer. AdSense requires it to mention cookies, Google advertising and the opt-out links — it does.
- **Missing ads.txt** → included (fill in your publisher ID).
- **Thin content** → the homepage includes real descriptive content (about section, game guides, FAQ). Don't strip it out before review.
- **Site not crawlable** → `robots.txt` and `sitemap.xml` are included. Make sure the domain actually resolves and isn't password-protected.
- **Under-construction pages** → don't submit for review with broken links or empty pages.
- Also verify in AdSense → Sites that the domain is added **exactly** as served (e.g. `jesper.live`), and that DNS/redirects (www vs apex) resolve consistently.

After fixing, request a review in AdSense → Sites. Reviews typically take a few days to a few weeks.

## Local development

No tooling needed — open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```
