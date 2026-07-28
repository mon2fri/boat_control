Try to follow below color schema, and apply it with current style.

### Colour schema (what's defined in `:root`)

#### 1) Core brand / neutrals
- **Brand red:** `--red`: `#db0011` (primary action colour; buttons, top border accent)
- **True neutrals:**
    - `--black`: `#000`
    - `--white`: `#fff` (main page background, cards, inputs, tables)

#### 2) Greys (UI surfaces + text)
A classic "light-to-dark" grey ramp for borders, secondary text, and subtle UI structure:
- `--pearl`: `#f3f3f3` (very light grey)
- `--silver`: `#d7d8d6` (light grey)
- `--pewter`: `#767676` (mid grey)
- `--charcoal`: `#333` (dark grey)

#### 3) Slate family (primary text + dark UI areas)
These are the "HSBC corporate slate" style tones used for headings, body text, and the top bar:
- `--light-slate`: `#4d6474`
- `--slate`: `#3e5b5d`
- `--dark-slate`: `#253038`
- **Deep corporate slate:** `--corp-slate`: `#1d262c` (used as the topbar background and main text colour)

#### 4) Status / RAG palette (semantic colours)
Used for success/warning/error-style messaging and change indicators:
- **Red (risk/error):** `--rag-red`: `#a8000b`
- **Amber (warning/change):** `--rag-amber`: `#fb3` (short hex = `#ffbb33`)
- **Green (success):** `--rag-green`: `#00847f`
- **Blue (info):** `--rag-blue`: `#305a85`

#### 5) Status tints (soft backgrounds for RAG)
These are pale background fills paired with the stronger RAG colours for borders/accents:
- `--rag-red-tint`: `#f9f2f3`
- `--rag-amber-tint`: `#fff8ea`
- `--rag-green-tint`: `#e5f2f2`
- `--rag-blue-tint`: `#ebef4` *(注：此处原文可能为笔误，通常为 #ebeff4)*

#### 6) Accent / interaction colours
- **Primary accent (focus ring; UI emphasis):** `--primary`: `#367ea2` (blue-teal)
- **Primary background tint (e.g., table header fill):** `--bgPrimary`: `#ddf6f5` (very light aqua)

---

### How the scheme is applied in the UI (at a glance)
- **Navigation/top bar:** dark (`--corp-slate`) with a **red** underline accent (`--red`)
- **Primary buttons:** **red** background (`--red`) with white text
- **Surfaces (cards, tables, inputs):** **white** with very light grey borders (rgba blacks)
- **Tables:** header uses `--bgPrimary` (light aqua) to separate from body rows
- **Messages / change pills:** use RAG colours with matching **tints** as the background and stronger colour as an accent/border



| Token | Hex | Where it's used in this CSS | What it does visually |
| :--- | :--- | :--- | :--- |
| `--red` | `#db0011` | `.topbar` border-bottom; `.btn` background + border | Primary brand accent and primary action colour |
| `--black` | `#000` | Not directly referenced (but black is used via `rgba(0,0,0,...)` throughout) | Reserved "true black" token; current file mostly uses RGBA blacks instead |
| `--white` | `#fff` | `body` background; cards/inputs/tables; scrollbar track; skip-link background; secondary button background | Default surface/background colour |
| `--pearl` | `#f3f3f3` | Not directly referenced | Light neutral token defined for future/light surfaces |
| `--silver` | `#d7d8d6` | Not directly referenced | Neutral token defined for future borders/dividers |
| `--pewter` | `#767676` | Not directly referenced | Mid neutral token defined for secondary UI/text |
| `--charcoal` | `#333` | Not directly referenced | Dark neutral token defined for headings/strong text |
| `--light-slate` | `#4d6474` | Not directly referenced | Slate ramp token (available for UI text/accents) |
| `--slate` | `#3e505d` | Not directly referenced | Slate ramp token (available for darker sections) |
| `--dark-slate` | `#253038` | Not directly referenced | Slate ramp token (available for darker sections) |
| `--corp-slate` | `#1d262c` | `body` text colour; `.topbar` background; `.btn-secondary` text | Main "corporate" text colour + dark header background |
| `--rag-red` | `#a8000b` | `.flash-danger` left border; `.pill-removed_row` border (rgba derived from it) | Error/removal emphasis |
| `--rag-amber` | `#fb3` (`#ffbb33`) | `.flash-warning` left border; `.pill-modified` border (rgba derived from it) | Warning/modified emphasis |
| `--rag-green` | `#00847f` | `.flash-success` left border; `.pill-added_row` border (rgba derived from it) | Success/addition emphasis |
| `--rag-blue` | `#305a85` | Not directly referenced | "Info" semantic colour available but unused in current selectors |
| `--rag-red-tint` | `#f9f2f3` | `.flash-danger` background; `.pill-removed_row` background | Soft error/removal background fill |
| `--rag-amber-tint` | `#fff8ea` | `.flash-warning` background; `.pill-modified` background | Soft warning/modified background fill |
| `--rag-green-tint` | `#e5f2f2` | `.flash-success` background; `.pill-added_row` background | Soft success/addition background fill |
| `--rag-blue-tint` | `#ebeffa` | Not directly referenced | Soft info background available but unused |
| `--primary` | `#367ea2` | `.input:focus` border + focus ring (rgba derived from it) | Primary interactive highlight (focus state) |
| `--bgPrimary` | `#ddf6f5` | `.table thead th` background | Light "primary" surface tint for table headers |
| `--dropDownHeight` | `180px` | `select[multiple]` max-height | Controls multi-select dropdown height (not a colour, but part of the token set) |

