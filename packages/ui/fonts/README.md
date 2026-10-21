# Fonts

`GoogleSansFlex-Variable.woff2` is Google Sans Flex (version 4.005, SIL Open Font License, `OFL-GoogleSansFlex.txt`),
trimmed for the Portal and the Ops Hub. Both apps load it with `next/font/local` (`apps/*/app/fonts.ts`).

What it keeps:

- **Characters:** Basic Latin and Latin-1 (accented letters such as é, ñ, ü) plus common punctuation, the euro sign
  and the trademark sign. Letters outside that set (for example ł or ễ) show in the fallback font.
- **Weight axis:** 400 to 1000. The apps use 400, 500, 600 and 700, and bold inside bold can reach 900.
- **Optical size axis:** the full 6 to 144, so `font-optical-sizing: auto` draws each size as before.
- **Every layout feature** (kerning, ligatures, tabular figures and the rest).

What it drops: the width, grade, roundness and slant axes. The apps never set them, so they always sat at their
defaults (width 100, grade 0, roundness 0, slant 0). Pinning them there leaves every letter where it was. Checked on
2026-10-21 over all 376 glyphs at 8 weights and 17 sizes: no advance width changed, and no outline point moved more
than 0.5 of the font's 2,000 units per em (0.02 px at 74 px). Screenshots of 29 screens of both apps at 390 and
1440 px: 26 of 58 pixel-identical, and the rest differ in at most 9 pixels, each by 1 shade out of 255.

The file went from 1,397 KB to 90 KB.

## Remaking it

The untrimmed file is in git history (`git show 77e8ba8:packages/ui/fonts/GoogleSansFlex-Variable.woff2`). With
fontTools 4.60.1 and brotli installed (`pip install "fonttools[woff]==4.60.1" brotli`):

```bash
fonttools varLib.instancer original.woff2 wdth=100 GRAD=0 ROND=0 slnt=0 wght=400:1000 -o GoogleSansFlex-Variable.woff2
```

If a screen starts using another weight below 400, a width, or `font-variation-settings`, remake it from the original
with that axis kept, and change `weight` in both `fonts.ts` files to match.
