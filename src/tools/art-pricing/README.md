# Art Pricing Calculator

Estimates an artwork's selling price from time, dimensions, and materials. Also includes a reverse calculator that works backwards from a target price to recommend canvas dimensions.

---

## Inputs

### Basic

| Field | Description | Default |
|---|---|---|
| Time spent (hours) | Hours of studio time invested | — |
| Width (inches) | Finished artwork width | — |
| Height (inches) | Finished artwork height | — |
| Complexity multiplier | Scale factor for extra detail or difficulty. 1 = normal | 1 |
| Materials cost ($) | Out-of-pocket materials expense | 0 |

### Advanced (collapsible)

| Field | Description | Default |
|---|---|---|
| Hourly rate ($/hr) | Your studio labor rate | 45 |
| Area rate ($ per size unit) | Rate applied to area after exponent scaling | 4 |
| Size exponent | Controls how strongly size affects price. 0.5 = softer growth, 1.0 = direct area growth | 0.75 |
| Time vs area weight | 0 = price driven entirely by area; 1 = price driven entirely by time | 0.6 |
| Fixed overhead ($) | Flat per-piece business overhead added after blend and complexity | 20 |
| Minimum price ($) | Price floor — final price is never lower than this | 150 |
| Gallery commission (%) | Commission rate used for channel math | 50 |
| Commission handling | `Add on top` (buyer pays) or `Included` (artist absorbs) | Included |

---

## Calculations

### Forward (price from artwork)

```
time cost   = time × hourly_rate
area cost   = (width × height)^area_exponent × area_rate
blended     = time_cost × time_weight + area_cost × (1 − time_weight)
raw price   = (blended × complexity) + materials + overhead_fixed
gallery amt = raw_price × commission / 100
list price  = raw_price + gallery_amt      # add-on mode
list price  = raw_price                    # included mode
final price = max(list_price, min_price)
```

The blending weight lets you balance time-based and size-based pricing. At 0.5 both contribute equally. At 1.0 only time is used (useful for very fast, large work). At 0.0 only area is used (useful for very labor-light prints or reproductions).

The area exponent controls how aggressively large canvases scale. At 0.5, size grows more gently (legacy square-root style). At 1.0, size scales directly with area.

The minimum price floor is applied last, after commission. It guarantees the artist never undersells even for trivially small works.

### Reverse (dimensions from target price)

Given a target selling price, estimated hours, and an aspect ratio, the reverse calculator solves for the canvas dimensions that would produce that price using the same formula.

```
adjusted_target     = target / (1 + commission / 100)    # only in add-on mode
target_blended      = (adjusted_target − materials − overhead_fixed) / complexity
weighted_time_cost  = estimated_time × hourly_rate × time_weight
target_area_cost    = target_blended − weighted_time_cost
scaled_area         = target_area_cost / (area_rate × (1 − time_weight))
area                = scaled_area^(1 / area_exponent)
width               = √(area × aspect_ratio)
height              = width / aspect_ratio
```

If the time cost alone exceeds the adjusted target, no valid size exists and the result shows zero dimensions with an explanatory message.

The reverse calculator always verifies by running the forward formula on the resulting dimensions and displaying the verified price.

#### Aspect ratio options

| Label | Ratio |
|---|---|
| 1:1 — Square | 1.0 |
| 1:√2 — ISO / A-series | 1.414 |
| 4:3 | 1.333 |
| 3:2 | 1.5 |
| 1.618:1 — Golden Ratio | 1.618 |

---

## State persistence

Form state (all basic and advanced inputs) is persisted to `localStorage` under the key `artist-tools.art-pricing`. The advanced panel collapsed state and reverse calculator collapsed state are not persisted — they reset to closed on page load.

## How This Tool Works (UI section)

The results panel includes a plain-language “How this tool works” section that explains the pricing logic in simple terms:

1. Start from labor (time × rate).
2. Add a size signal (area with exponent scaling).
3. Blend labor and size.
4. Apply complexity.
5. Add materials and fixed overhead.
6. Handle commission by selected mode.
7. Apply minimum price floor.

The input panels also show short in-context `Default:` hints under each field so users can understand baseline values without opening external docs.

---

## Files

| File | Role |
|---|---|
| `artPricing.ts` | Pure calculation logic. No React imports. Exports `calculatePrice`, `calculateReversePrice`, `defaultArtPricingInput` and all types. |
| `artPricing.test.ts` | Vitest tests for all calculation scenarios. |
| `ArtPricingPage.tsx` | React page component. Form state, localStorage persistence, UI layout. |
| `ArtPricingPage.test.tsx` | Integration tests for the page component using Testing Library. |
| `README.md` | This file — canonical spec for the tool. |

---

## Design constraints

- No backend. All calculations happen in the browser.
- No currency selection. Prices are always in USD.
- No saving or managing multiple pricing presets.
- No print or export functionality.
- The reverse calculator uses the same advanced settings as the forward calculator. They share a single set of rate/weight/commission inputs.
- The tool does not enforce any particular pricing philosophy — all defaults are adjustable.
