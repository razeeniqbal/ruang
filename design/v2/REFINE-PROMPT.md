# Ruang V2 — Living Office refinement prompt

Attach `RUANG V2 Living Office Integration Test.png` as the image to edit.
Optionally attach `RUANG V2 Master Test Office Composition.png` (artwork reference)
and `RUANG V2 Master Status & Activity Effects System.png` (icon reference).

If the tool supports editing selected areas (inpainting), apply it in passes:
1) banner + wall sign, 2) status icons, 3) employees, 4) plants + clutter.
This preserves the pixel style far better than one full regeneration.

## Notes on the current image (2026-10-02)

| Item | Current | Target |
|---|---|---|
| Employees | ~22 | 11 |
| Status icons | ~15 | 5 |
| Plants | ~25 | ~16–18 |
| Promo text | header, flag, wall slogan | none (reception "RUANG" only) |

- The left focus-booth icon resembles the WhatsApp logo — remove it.
- Characters are too uniform (same black hair, white shirt) — ask for variety.

## Prompt

```
Edit the attached RUANG V2 office image. Keep the floor plan, camera angle,
pixel-art style, materials and character design exactly as they are.
This is a cleanup pass, not a redesign.

1. CROP OUT the top banner (logo, tagline, flag). The office fills the frame,
   like an in-game screenshot.
2. REPLACE the bottom-right wall sign with a small framed abstract artwork
   (as in the empty composition reference).
3. EMPLOYEES — reduce to 11:
   - Keep: 1 on lounge armchair, 1 at pantry coffee machine, 3 at desks
     (open-plan), 3 in glass meeting room, 1 at whiteboard facing the board,
     1 in the left focus booth, 1 at reception.
   - Remove: the second lounge person, window-counter person, person at lift,
     both people at round green table, right focus booth person, right café
     table person, and 4 of the 7 desk workers.
   - Add 1 person walking in the central oak corridor.
   - Vary hair, skin tone and smart-casual clothing; one woman in a hijab,
     one woman without.
   - Seated people sit squarely in chairs, facing their monitors.
   - Keep EVERY desk, chair, monitor and seat, even when empty. Empty
     workstations are capacity for future employees, not clutter.
4. STATUS ICONS — keep only 5, small with no white bubble behind them:
   needs-approval (left desk), gear (one desk), magnifier (one desk),
   one collaboration icon above the meeting group, green check (one desk).
   Remove every other icon, including the phone icon on the booth.
5. PLANTS — remove the desk-top plants, the pots beside the window counter,
   the plants inside the meeting-room corners, the pair beside the whiteboard,
   and all but one plant along the right corridor. Keep the lounge plant,
   reception plant, long planter box and the slatted planter by the booths.
6. Remove small clutter (extra cups, papers) from desks.
   Leave the round table, café table and right booth empty.

Result: a calm, spacious office with clear walking paths. Keep the subtle
"RUANG" text on the reception desk, with no other text anywhere.
```
