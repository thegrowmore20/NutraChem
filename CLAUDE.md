## Shopify Theme Development Guidelines

You are an Expert Shopify Theme Developer with advanced knowledge of Liquid, HTML, CSS, JavaScript, and the latest Shopify Online Store 2.0 features.


## Liquid Development


### Valid Filters

Use filters for: Cart operations, HTML manipulation, Collection handling, Color utilities, String transformations, Localization, Customer data, Formatting, Fonts, Payment processing, Mathematical operations, Array manipulation, Media handling, Metafields, Money formatting, Tags, and hosted file operations.


### Valid Tags

Use tags for: Theme operations (content_for, layout, include, render), HTML forms/styles, Variables (assign, capture), Iteration (for, paginate), and Conditionals (if, case).


### Validation Rules

- Use{% liquid %}for multiline code
- Maintain proper closing order
- Use object dot notation
- Apply defensive coding practices
- Make sure no translation is missing


## Theme Architecture


### Directory Structure

- sections/- Customizable page areas
- blocks/- Configurable elements
- layouts/- Repeated content
- snippets/- Reusable fragments
- config/- Settings
- assets/- Static files
- locales/- Translations
- templates/- Page structure specifications


## UX Principles

- Keep all text translated using locale files with sensible keys
- Settings should be simple, clear, and non-repetitive
- Order settings by visual impact and element placement
- Group related settings under headings
- Avoid word duplication between headings and labels
- Use conditional settings judiciously (max 2 levels deep)


## HTML Standards

- Use semantic HTML with modern features
- Implement ID naming as CamelCase
- Append block/section IDs appropriately
- Ensure interactive elements remain focusable
- Usetabindex="0"sparingly


## CSS Guidelines

- Avoid ID selectors; maintain 0-1-0 specificity with single class selectors
- Use CSS variables for redundancy reduction
- Never hardcode colors; employ color schemes
- Apply BEM naming conventions
- Use mobile-first media queries withscreendescriptor
- Limit nesting to first level except for media queries
- Primary color: #18252B (near-black navy — headings, body text, sold-out badges)
- Secondary color: #008FA3 (teal — primary/accent buttons, sale badges, links)
- Text on a colored/photo background must keep at least a 4.5:1 contrast ratio (3:1 for text ≥24px, or ≥19px bold); never use a muted gray lighter than roughly `#55636b` on a white/light background for body-sized text


## JavaScript Principles

- Minimize external dependencies; prioritize native browser features
- Avoidvar; preferconstoverlet
- Usefor...ofloops instead offorEach()
- Implement module patterns to avoid global scope pollution
- Prefix private methods with#
- Group scripts by feature area
- `assets/global.js` is for truly site-wide behavior only (things present in `layout/theme.liquid` itself, like the scroll progress bar). Anything tied to a specific section or snippet (header nav/scroll, product card interactions, filters, sliders, etc.) belongs in that section's own `{% javascript %}` block, not global.js — this keeps JS scoped so pages that don't render a section don't pay for its script
- Use `{% stylesheet %}` / `{% javascript %}` tags in each section for its own CSS/JS; `assets/base.css` stays reserved for genuinely shared/common CSS (reset, `.container`, the `.h0`-`.h6` scale, `.button`, shared snippet styles like `product-card`/`price`/`star-rating`)
- Cart state is cross-section, so it's the one exception to the rule above: the add-to-cart form-submit listener lives in `global.js` as a single delegated `submit` handler on `[data-product-form]` (every product grid reuses the same form, so one listener beats duplicating it per section). Everything else cart-related (drawer open/close, line-item mutation, icon-bubble patching) stays section-local and talks to the rest of the page only through two custom events: `cart:open` (dispatched by the header's cart button to open the drawer) and `cart:updated` (dispatched by `global.js` after any successful `/cart/add.js` or `/cart/change.js` response, carrying `{ sections }` from the Cart AJAX API's `sections` param). A section reacts to `cart:updated` by extracting and swapping only the DOM fragment it owns (e.g. `#CartDrawerContent`, `#CartIconBubble`) via `DOMParser` — never blind-replacing a whole section — so unrelated JS-bound state (scroll classes, open/closed menus) survives the swap
- Mobile nav accordion: only one top-level item may be open at a time. Opening a new item must smoothly close whichever one was already open — never a snap/instant close. Animate via CSS `grid-template-rows: 0fr → 1fr` on the panel (with an inner `overflow: hidden` wrapper) rather than JS-measured `max-height`, so the transition is free and there's no scrollHeight/reflow code to maintain


## Accessibility & SEO

- Every `image_tag`/`img` needs an explicit `alt`. Use a real description when the image carries information the surrounding text doesn't already give (product/collection/article title, etc.). Use `alt: ''` only for genuinely decorative images (icons next to visible text, repeated watermark logos) — never omit the attribute entirely
- Every page must render a non-empty `<meta name="description">` — fall back through `page_description | default: shop.description | default: shop.name` rather than wrapping the tag in a blank-check `{% if %}` that can omit it entirely
- Never leave a meta tag with an empty `content=""` (e.g. `theme-color`) — either give it a real value or remove the tag
- Icon-only interactive elements (search/cart/account/menu buttons) always need `aria-label`; links must have a real `href` (no `href="#"`) and descriptive/unique text — avoid repeating identical link text like "Read More" without distinguishing context for assistive tech
- Run a Lighthouse pass (Accessibility, SEO, Best Practices) after any change touching layout/theme.liquid, meta-tags.liquid, or images, since these three categories regress silently and are easy to miss without checking


## Performance Optimization

- Optimize image loading via Shopify's CDN
- Minify assets
- Leverage browser caching
- Reduce HTTP requests
- Implement lazy loading
- Monitor performance using Google Lighthouse and Shopify Theme Check


## Audit Findings (Shopify best-practices review, 2026-09-15; fixes applied 2026-09-16)

Findings from an audit against `shopify.dev/docs/storefronts/themes/best-practices/performance` and `.../accessibility`. Most items below were fixed on 2026-09-16 — see file history for details. Remaining open items are listed; fix opportunistically when touching related files.

**Still open**
- `features-with-image.liquid:30`'s no-image fallback (`Group 79.png`) is a raw `asset_url` `<img>`, bypassing Shopify CDN's auto WebP/AVIF/`srcset` — left as-is because converting it to an `image_picker` default requires uploading the asset to the shop's Files via Shopify admin, which this session doesn't have access to
- `.button` mobile height is intentionally 40px (`base.css:155-159`) per an explicit prior user request, which is under the 44×44px touch-target guideline — only change this if the user wants to reconcile it with accessibility
- No manual `preconnect` hints added — needs a real network-waterfall check (AirReviews/Instagram-feed app script origins) to know which hosts actually need it; adding hints blindly could preconnect to origins that are unused on a given page

**Fixed 2026-09-18**
- Product JSON-LD added through `snippets/product-schema.liquid`, rendered by `sections/main-product.liquid`. Includes variant offers, optional review metafields, and variant weight in grams. Price expiry and manufacturer part numbers require real source data and are not inferred.

**Fixed 2026-09-16**
- `srcset`/`sizes` added to `image_tag` calls in `product-card.liquid`, `collection-list.liquid`, `blog-posts.liquid`, `features-with-image.liquid`, `split-banner.liquid`, `footer.liquid`, `brand-story.liquid`
- `shopify_common.js` now loads with `defer` in `theme.liquid`
- `font_body` is now preloaded alongside `font_heading` in `theme.liquid`
- Added a Speculation Rules API block (`moderate` eagerness, excluding cart/account/checkout) to `theme.liquid`
- Added a skip-to-content link and `tabindex="-1"` on `#MainContent` in `theme.liquid`/`base.css`
- Mobile menu toggle now has `aria-expanded`/`aria-controls`, focuses the first link on open, and Esc closes it and returns focus to the launcher (`header.liquid`)
- Header icon buttons (search/cart/account/menu) now hit a 44×44px touch target via padding + negative margin, without changing visual icon size
- `brand-story.liquid` reel videos now have a real pause/play toggle button (WCAG 2.2.2) instead of an inert decorative play icon
- Footer column headings changed from `<h3>` to `<h2>` (no `h2` ancestor existed in that landmark)
- `aria-current="page"` added to the active nav link in `header.liquid`
- Removed the dead dropdown chevron in `header.liquid` (no submenu markup ever existed)
- Added a gradient scrim behind `.header--transparent` so nav text/icons keep contrast over any hero photo
- Footer social links now have a visually-hidden "(opens in a new tab)" cue
- Added `Organization` JSON-LD and a fallback `og:image` (via `shop.brand`) in `meta-tags.liquid`
- Reviewed `section.index`-based above/below-fold loading for the first product grid: not applied, because the hero defaults to full-viewport height, so the first grid is genuinely below the fold and `loading:'lazy'` is already correct there


## Example Section Schema

```
{%schema%}{"name": "Section Name","tag": "section","class": "section-class","settings": [{"type": "text","id": "heading","label": "t:sections.section_name.settings.heading.label","default": "Default Heading"}],"blocks": [],"presets": [{"name": "t:sections.section_name.presets.name"}]}{%endschema%}
```
