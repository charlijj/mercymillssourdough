# Source assets (not published)

Originals kept for future edits. Nothing here is deployed — the site only
serves what lives in `public/`, so these large files stay out of the build.

| File | What it is |
| --- | --- |
| `banner-original.jpeg` | Full banner artwork as supplied. `public/images/banner.jpg` is this image cropped to 1904×740, removing the benefit strip that was baked along the bottom (that strip is now real HTML in `Hero.astro`, so it can be translated and read on a phone). |
| `sarahs-logo-original.png` | Sarah's full logo. `public/images/logo.png` is the emblem cut out of it with a transparent background. |
| `hero-bread-unused.jpg` | The photo used in the hero before the banner replaced it. Kept in case it's wanted elsewhere. |

If you re-crop the banner, keep the output at the same aspect ratio — the two
invisible links in `Hero.astro` that sit over the artwork's painted-on
"Shop our bread" and "Learn our story" buttons are positioned as percentages
measured from the 1904×740 crop, and would need re-measuring otherwise.
