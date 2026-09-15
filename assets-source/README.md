# Source assets (not published)

Originals kept for future edits. Nothing here is deployed — the site only
serves what lives in `public/`, so these large files stay out of the build.

| File | What it is |
| --- | --- |
| `banner-original.jpeg` | Full banner artwork as supplied. `public/images/banner.jpg` is this image cropped to 1904×740, removing the benefit strip that was baked along the bottom (that strip is now real HTML in `Hero.astro`, so it can be translated and read on a phone). |
| `logo-small-original.jpeg` | The round badge logo, as supplied on a white square. `public/images/logo.png` is its circle cut out to a transparent PNG (so it sits on the cream header without a white box), and `public/favicon.png` is the same at 128px. |
| `logo-large-original.jpeg` | The wide logo lockup, as supplied. `public/images/logo-full.jpg` is it trimmed to the artwork and resized to 900px for the footer; `public/images/og-image.jpg` is it centred on a 1200×630 social-share card. |
| `sarahs-logo-original.png` | Sarah's earlier logo, superseded by the two above. Kept for reference. |
| `making-focaccia-unused.jpg` | In-progress focaccia photo that lived in the "How it's made" section. That section was removed, so the photo has no home on the page. Kept so it can be placed somewhere else. |
| `hero-bread-unused.jpg` | The photo used in the hero before the banner replaced it. Kept in case it's wanted elsewhere. |

If you re-crop the banner, keep the output at the same aspect ratio — the two
invisible links in `Hero.astro` that sit over the artwork's painted-on
"Shop our bread" and "Learn our story" buttons are positioned as percentages
measured from the 1904×740 crop, and would need re-measuring otherwise.
