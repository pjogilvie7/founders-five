# Art credits and generation log (T5)

All raster art is original, generated with Higgsfield (model `gpt_image_2_5`, quality high, 1k) and then
post-processed locally. No logos, no real people, no real company marks, nothing resembling NGPF Build Your
Stax (no pig, no top hat, no "Stax" wordmark, no olive money-green). The eight tool icons and all guilloche
(rosettes, security waves, seal rings, certificate border) are hand-written or code-generated SVG, zero credits
(`scripts/art-post.mjs`, `ui/guilloche.js`).

## Balance and spend
- Balance before the first generation (2026-11-02, `balance`): **1185.75** credits
- Balance after the last generation: **1157.25** credits
- Total used: **28.5 credits** of the 150 authorised (stop-line 140). Cost per image: 1.5 (checked with `get_cost` before spending).
- 19 generations, 19 kept, 0 rejected, 0 re-rolls. No unlimited/free generations were used.

## Style prompt (shared by every raster)
"... Engraved banknote vignette style, 19th-century stock certificate illustration: monochrome black fine-line
steel engraving, dense cross-hatching, stipple, vignette fading to blank edges, on plain flat light cream paper
background. No text, no letters, no logos, no color."  (rivals and the title medallion use "round emblem / circular
guilloche rosette border" instead of the vignette-fade wording.)

## Generation log
Time is the job creation time, 2026-11-02 UTC. Credits are per image (balance deltas: first batch of 3 = 4.5, then 12 = 18, then 4 = 6).

| # | Time | Model | Subject (prompt summary) | Credits | Output file | Result |
|---|------|-------|--------------------------|---------|-------------|--------|
| 1 | 05:30:37 | gpt_image_2_5 high 1k 1:1 | Circular engraved medallion: classical allegorical woman with scales and cornucopia inside a spirograph rosette border | 1.5 | assets/title/medallion.png | kept |
| 2 | 05:30:37 | gpt_image_2_5 high 1k 4:3 | Generic unmarked two-stage rocket lifting off a pad, smoke plume, radiating sky lines, no markings | 1.5 | assets/vignettes/rocket.png | kept |
| 3 | 05:30:37 | gpt_image_2_5 high 1k 4:3 | Robed allegorical woman raising an ornate key before a stone doorway | 1.5 | assets/vignettes/neutral-key.png | kept |
| 4 | 05:31:41 | gpt_image_2_5 high 1k 4:3 | Three-masted tall ship under full sail | 1.5 | assets/vignettes/neutral-ship.png | kept |
| 5 | 05:31:42 | gpt_image_2_5 high 1k 4:3 | Stone arch bridge over a river gorge, lone traveler | 1.5 | assets/vignettes/neutral-bridge.png | kept |
| 6 | 05:31:41 | gpt_image_2_5 high 1k 4:3 | Antique balance scale on a draped pedestal with robed figure, laurel and wheat | 1.5 | assets/vignettes/neutral-scales.png | kept |
| 7 | 05:31:42 | gpt_image_2_5 high 1k 4:3 | Lighthouse on a rocky headland, breaking waves, beams across a stormy sky | 1.5 | assets/vignettes/neutral-lighthouse.png | kept |
| 8 | 05:31:41 | gpt_image_2_5 high 1k 4:3 | Domed straw beehive skep, bees, clover, garden fence | 1.5 | assets/vignettes/neutral-beehive.png | kept |
| 9 | 05:31:42 | gpt_image_2_5 high 1k 4:3 | Software allegory: woman at a loom weaving gears and punched-card lattice, brass analytical engine | 1.5 | assets/vignettes/reveal-software.png | kept |
| 10 | 05:31:41 | gpt_image_2_5 high 1k 4:3 | Consumer allegory: woman at a laden market stall, cloth, barrels, produce, cart | 1.5 | assets/vignettes/reveal-consumer.png | kept |
| 11 | 05:31:40 | gpt_image_2_5 high 1k 4:3 | Fintech allegory: woman with coins, strongbox, vault door, ledger and quill | 1.5 | assets/vignettes/reveal-fintech.png | kept |
| 12 | 05:31:42 | gpt_image_2_5 high 1k 4:3 | Health allegory: staff with a single serpent, mortar and pestle, retort, herbs | 1.5 | assets/vignettes/reveal-health.png | kept |
| 13 | 05:31:42 | gpt_image_2_5 high 1k 4:3 | Mobility allegory: steam locomotive on a viaduct, winged wheel, early horseless carriage, signal post | 1.5 | assets/vignettes/reveal-mobility.png | kept |
| 14 | 05:31:41 | gpt_image_2_5 high 1k 4:3 | Travel allegory: harbor steamship at a quay, trunks on the pier, hotel facade, traveler with parasol | 1.5 | assets/vignettes/reveal-travel.png | kept |
| 15 | 05:31:43 | gpt_image_2_5 high 1k 4:3 | Industry (other) allegory: woman with anvil, hammer, cogwheels, wheat, distant factory and sailing ship | 1.5 | assets/vignettes/reveal-other.png | kept |
| 16 | 05:31:52 | gpt_image_2_5 high 1k 1:1 | The Holder emblem: clenched fist gripping a chained anchor inside a guilloche rosette border | 1.5 | assets/rivals/holder.png | kept |
| 17 | 05:31:52 | gpt_image_2_5 high 1k 1:1 | The Seller emblem: hourglass beside an open palm inside a guilloche rosette border | 1.5 | assets/rivals/seller.png | kept |
| 18 | 05:31:52 | gpt_image_2_5 high 1k 1:1 | The Playbook emblem: navigator's compass on an open book inside a guilloche rosette border | 1.5 | assets/rivals/playbook.png | kept |
| 19 | 05:31:52 | gpt_image_2_5 high 1k 4:3 | Generic unmarked rocket ascending above the clouds at the edge of space, curved horizon, stars | 1.5 | assets/vignettes/rocket-orbit.png | kept |
| | | | **Total** | **28.5** | | 19 kept, 0 rejected |

Higgsfield job ids (for the record): medallion 0e7416a0, rocket ef57c99f, key 9f67f67c, ship f7ad6ae3, bridge a289d9bb,
scales be829022, lighthouse 77a21266, beehive 7bdfe47f, software 9fce63d3, consumer c8586f90, fintech 299c5414,
health d5bcb4f7, mobility f99dd8e2, travel 6d60a4ed, other 5eaa0336, holder f385c0a4, seller dafdab5d,
playbook 90de0711, rocket-orbit fcba699d.

## Post-processing (local, Python Pillow; ImageMagick is not installed)
Per raster: convert to grayscale; take the paper level (90th percentile of luminance, 99th for the dark-sky orbit
image) and the ink level (0.4th percentile); map luminance to alpha linearly (alpha 0 below 7%, gamma 0.85); fill
with ink **#18262F**; crop to the content box plus 14 px; resize (Lanczos) to 900 px wide (vignettes), 720 px
(title), 512 px (rivals), 560 px (the narrow key figure); quantise alpha to 16 levels and save as an 8-bit palette
PNG with a tRNS table. Result: duotone-ready ink-on-transparent PNGs, each under 250 KB (largest 223 KB). On the
paper (#F1ECDF) they composite back to the engraved original; on the dark rail place them on a paper plate.

## Icons and guilloche (zero credits)
- `assets/icons/{stock,plan,collar,credit,cash,put,exchange,rules}.svg`: seal, quill and calendar, shield bracket,
  key, columns, umbrella, vault, scroll. 32x32 viewBox, 1.3 stroke ink #18262F, legible at 24 px. Generated by `scripts/art-post.mjs`.
- `ui/guilloche.js`: `rosette`, `securityWave`, `sealRing`, `certificateBorder` (deterministic SVG strings).
