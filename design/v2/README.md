# Ruang V2 design references

| File | Use it for |
|---|---|
| `RUANG V2 Living Office Final.webp` | **Definitive office reference** — mood, density, seating, status-icon restraint |
| `RUANG V2 Master Test Office Composition.png` | Floor plan and furniture capacity (empty office, every desk) |
| `RUANG V2 Master Status & Activity Effects System.png` | Status icon designs |
| `RUANG V2 Master Employee Character System.png` | Character design |
| `RUANG V2 Employee Movement System.png`, `Work & Interaction Animation.png` | Animations |
| `RUANG V2 Master Environment / Furniture / Technology / Interactive Office Objects / Decorations & Small Props.png` | Sprite sources |
| `Ruang Logo Concept.png` | Logo |
| `RUANG V2 Living Office Integration Test.png`, `... Refined.webp` | Superseded drafts (history only) |
| `REFINE-PROMPT.md` | Prompt used to produce the Final image |

## Rules taken from the Final reference

- Seated workers sit on the near side of the desk, back to the camera (matches the engine's desk slot at `y+2`).
- Furniture = capacity; people and status icons are runtime state.
- About 5 status icons on screen at once; needs-approval / blocked / error always shown, others on hover/selection.
- No room labels, no employee name tags, no slogans; only the subtle "RUANG" on reception.
- Plants only at reception, lounge, corners and transitions.

Known gap: Final shows 6 open-plan desks; the empty composition shows 7. Desk count is set in code (`office-layout.js`), not by the image.
