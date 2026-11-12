# Event Pass template: how to add a new event

Michael (Nov 12 2026): "Use this pass format for all future events as well. Just fill in the new prizes."

The pass screen and its reward logic are event-agnostic. The screen includes the hero with the top-3 premium pictures, the value boxes, Claim all, the shuttle-skin picker, 30 two-lane tier rows, the tier-30 showcase and the sticky buy bar. The reward logic covers claims, already-owned fallbacks, income rewards, skins and premium purchase or restore.

Each event supplies only one `passEvent({...})` data block. Everything lives in `game-v37-trains.html`:

| Part | Marker in the file | What it is |
|---|---|---|
| Data | `/* ===== EVENT PASS DATA` … `/* ===== /EVENT PASS DATA ===== */` | One `passEvent({...})` per event. **This is the only part you edit for a new event.** |
| Logic + screen | `ppEv` / `PASS.render` … `/* ===== /EVENT PASS LOGIC ===== */` | Shared by every event. Don't fork it per event. |
| Styles | `.ep*` CSS | Colours come from the event's `theme`. |

The source files in the build workspace are `src/pass-data.js`, `src/pass-block.js` and `src/pass.css`, applied by `patch.py`.

## Steps for a new event (example: December 2026)
1. **Schedule:** the Spaceport schedule in `remote-config.json` (`spaceport`) gets the new id, e.g. `spaceport-2026-12`, with start/end as before. The pass picks its data by this id. Only change remote config when Michael approves.
2. **Data:** copy the November block and edit it:
   ```js
   passEvent({id:'spaceport-2026-12', ver:'sp-2026-12.1', def:1, name:'Frost Pass', theme:{accent:'#9be7ff',accent2:'#3a86ff',hero:['#1b3a6b','#0f2140','#081226'],lane:'#5a8fd8',laneBg:['#1a2c55','#0f1a33']},
    alt:{f:30,p:60},
    items:[ /* NEW cosmetics only, using existing renderers (see below) */ ],
    skins:{ icecore:{name:'Ice Core Shuttle',a:'#bfe9ff',b:'#3a86ff',sub:'Exclusive shuttle skin'} },
    F:[ /* 30 entries, tier 1..30 */ ],
    P:[ /* 30 entries, tier 1..30 */ ],
    preview:[{tier:30,big:1,sub:'Exclusive skin'},{tier:28,sub:'Animated frame'},{sum:'perm'}],
    show:{tier:30,title:'Ice Core Shuttle',text:'Exclusive skin for every shuttle on your pads<br>+ “Frost King” title'}});
   ```
   Move `def:1` to the newest event. It is the fallback data for an event id that has no block.
3. **Premium product:** this is automatic. `sp_pass_premium_YYYY_MM` is derived from the id (`ppProd`). A schedule-level `pid` overrides it. The Play product must exist and be active in Play Console, which only Michael can do.
4. **Test:** add the new id to `tests/event-pass-template.mjs`. Copy the "Frost Pass" dummy-event section and run `node tests/event-pass-template.mjs`. Keep old event blocks, so saves from an unfinished event finalise against what they were promised.
5. **Ship:** stamp the build, sign the OTA with `scripts/sign-ota.mjs`, stage it, and get Michael's approval before uploading.

## Reward fields (one object per tier; `null` = nothing on that lane)
| Field | Meaning |
|---|---|
| `leg: 0..9` | one of the 10 original Spaceport prizes (`TPRIZE`), free lane only. Keep them at their tiers. |
| `it`, `it2` | item id (from `items` or any existing item). Already owned → `alt` minutes of cash instead. |
| `skin` | shuttle skin id (from `skins`). Already owned → cash. `gold:1` gives the metallic gold renderer. |
| `min` | cash = N minutes of current income (`evRewardCash`) |
| `inc` | +N% income until the event ends (event-only; capped at +200% in total). Claimed after the end → N×3 minutes of cash. |
| `perm` | +N% income forever (capped at +100% in total, across all events) |
| `tk` | tickets |
| `boost` | N minutes of 2× boost |
| `alt` | per-tier override for the already-owned cash minutes |

A tier can combine fields, e.g. `{it:'frm_supernova',min:240}`.

## New items: existing renderers only
| Slot | Fields | Renderer |
|---|---|---|
| `title` | `name` | text title |
| `outfit` | `kind:'jacket', col, lap, trim` | pilot jacket |
| `cap` | `kind:'sp_patch'|'sp_comet'|'sp_hood'|'sp_moon'|'sp_astro'`, `sk`, `col`, `trim` | Spaceport cap drawings |
| `glasses` | `kind:'sp_visor', sk:'visor', col, lens:[a,b]` | visor |
| `frame` | `sf:'comet'|'nebula'|'orbit'|…` (static) or `an:PF.<index>` (animated) | pilot frame |

A truly new drawing, such as a new hat shape, needs code. Without that, swap in a recoloured existing item, or cash, as November did.

## `preview` (top-3 pictures in the banner)
`{tier:N}` uses that premium tier's picture and name. `{sum:'perm'}` or `{sum:'min'}` shows the premium-track total. Optional fields are `name`, `sub`, `tag` and `big:1` (the large first tile).

## Rules the logic guarantees for every event
- 30 tiers at the colonist thresholds `PASS_TH`. Claiming is per tier and per lane, and is saved in the Spaceport save (`f`/`p` flags).
- Buying Premium unlocks every premium tier already reached (Claim all). Restore and revoke work as before.
- `ver`: a pass save created before an event opens drops claim flags left over from an older table, once, so a carried-over save can't block or double-claim.
- An event with no data block shows the `def:1` event's prizes. **Always add the block before the event goes live.**
- Unclaimed rewards are auto-granted when the claim window closes (`spFinal`).
