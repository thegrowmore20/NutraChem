/* Truly site-wide behavior only. Section-specific JS (header, product cards, filters, etc.)
   lives in that section's own {% javascript %} block so it's only shipped on pages that use it. */

class ScrollProgress {
  #bar
  #ticking = false

  constructor() {
    this.#bar = document.querySelector('.scroll-progress-bar')
    if (!this.#bar) return

    window.addEventListener('scroll', () => this.#requestTick(), { passive: true })
    window.addEventListener('resize', () => this.#requestTick(), { passive: true })
    this.#update()
  }

  #requestTick() {
    if (this.#ticking) return
    this.#ticking = true
    requestAnimationFrame(() => {
      this.#update()
      this.#ticking = false
    })
  }

  #update() {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0
    this.#bar.style.width = `${pct}%`
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScrollProgress()
})

/* AJAX add-to-cart: the one cross-section exception to the "section-scoped JS" rule
   (see CLAUDE.md) — every product-card form across every section reuses this same
   listener instead of duplicating it per section. */
document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-product-form]')) return
  event.preventDefault()

  if (form.dataset.cartSubmitting === 'true') return
  form.dataset.cartSubmitting = 'true'
  const buttons = Array.from(form.elements).filter((element) => element.matches('button[type="submit"]'))
  const disabledStates = new Map(buttons.map((button) => [button, button.disabled]))
  for (const button of buttons) {
    button.classList.add('is-loading')
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
  }

  const formData = new FormData(form)
  formData.append('sections_url', window.location.pathname)

  fetch(window.routes.cartAddUrl, {
    method: 'POST',
    headers: { Accept: 'application/javascript' },
    body: formData,
  })
    .then((response) => response.json())
    .then((json) => {
      if (json.status) {
        console.error('Cart error:', json.description || json.message || json)
        document.dispatchEvent(new CustomEvent('cart:error', { detail: json }))
        return
      }
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { sections: json.sections } }))
    })
    .catch((error) => {
      console.error('Cart error:', error)
      document.dispatchEvent(new CustomEvent('cart:error', { detail: null }))
    })
    .finally(() => {
      delete form.dataset.cartSubmitting
      for (const button of buttons) {
        button.classList.remove('is-loading')
        button.disabled = disabledStates.get(button)
        button.removeAttribute('aria-busy')
      }
      form.dispatchEvent(new CustomEvent('cart:complete'))
    })
})

/* AJAX line-quantity changes: the same single-listener exception as add-to-cart above.
   Cart drawer and cart page reuse identical [data-cart-item] markup, so one delegated
   handler beats duplicating the /cart/change.js fetch in both sections (see CLAUDE.md). */
function updateCartLine(item, quantity) {
  const container = item.closest('[data-cart-sections]')
  if (!container) return

  container.classList.add('is-loading')

  fetch(window.routes.cartChangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      line: item.dataset.line,
      quantity,
      sections: container.dataset.cartSections.split(','),
      sections_url: window.location.pathname,
    }),
  })
    .then((response) => response.json())
    .then((json) => {
      if (json.status) {
        console.error('Cart error:', json.description || json.message || json)
        document.dispatchEvent(new CustomEvent('cart:error', { detail: json }))
        return
      }
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { sections: json.sections, openDrawer: false } }))
    })
    .catch((error) => {
      console.error('Cart error:', error)
      document.dispatchEvent(new CustomEvent('cart:error', { detail: null }))
    })
    .finally(() => {
      container.classList.remove('is-loading')
    })
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-cart-remove], [data-cart-qty-decrease], [data-cart-qty-increase]')
  if (!control) return
  const item = control.closest('[data-cart-item]')
  const input = item.querySelector('[data-cart-qty-input]')

  let quantity
  if (control.matches('[data-cart-remove]')) {
    quantity = 0
  } else if (control.matches('[data-cart-qty-decrease]')) {
    quantity = Math.max(0, Number(input.value) - 1)
  } else {
    quantity = Number(input.value) + 1
  }
  updateCartLine(item, quantity)
})

document.addEventListener('change', (event) => {
  const input = event.target.closest('[data-cart-qty-input]')
  if (!input) return
  updateCartLine(input.closest('[data-cart-item]'), Math.max(0, Number(input.value)))
})

/* Free sample addons: a product's form can carry a hidden
   properties[_sample_variant_id] input (see snippets/product-sample-addons.liquid)
   recording which sample the shopper picked. That property lives on the PARENT
   line only - the sample's own line is added with just properties[_is_free_sample]
   and nothing parent-specific, so Shopify recognizes the same sample picked via
   two different products as the same line and merges their quantity naturally.
   After every cart:updated, reconcileSampleAddons() recomputes from a fresh
   /cart.js read how many parent lines currently reference each sample variant
   and brings that sample's line quantity to match - this is what adds the
   sample on the shopper's first pick, merges a second product's matching pick
   into the same line, and removes/shrinks it when a parent is removed, all
   through the one mechanism. It never calls /cart/add.js for a sample that
   already has a line (only /cart/change.js with an absolute quantity on a
   freshly-read line position), so it doesn't depend on Shopify's add-to-cart
   merge behavior for anything but the very first add. */
const sampleAddonReconcile = { running: false, queued: false }

function sampleAddonSections() {
  const sections = new Set(['cart-drawer', 'header'])
  const cartSectionsAttr = document.querySelector('[data-cart-sections]')?.dataset.cartSections
  if (cartSectionsAttr) {
    for (const id of cartSectionsAttr.split(',')) sections.add(id)
  }
  return Array.from(sections)
}

async function sampleAddonChangeLine(line, quantity) {
  const response = await fetch(window.routes.cartChangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      line,
      quantity,
      sections: sampleAddonSections(),
      sections_url: window.location.pathname,
    }),
  })
  return response.json()
}

async function sampleAddonAddLine(variantId, quantity) {
  const response = await fetch(window.routes.cartAddUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      items: [{ id: variantId, quantity, properties: { _is_free_sample: 'true' } }],
      sections: sampleAddonSections(),
      sections_url: window.location.pathname,
    }),
  })
  return response.json()
}

function sampleAddonDispatchUpdate(json) {
  if (!json || json.status) {
    console.error('Sample addon reconcile error:', json?.description || json?.message || json)
    return
  }
  document.dispatchEvent(new CustomEvent('cart:updated', { detail: { sections: json.sections, openDrawer: false } }))
}

/* Applies at most one correction per pass, then returns - the cart:updated
   dispatch from that correction re-triggers reconcileSampleAddons(), which
   re-reads the now-current cart and either finds the next mismatch or finds
   none and stops. Doing it this way (one change, re-fetch, repeat) means every
   decision is always based on freshly-read line positions, never a position
   assumed from before another line in the same pass was removed. */
async function runSampleAddonReconcilePass() {
  const cartResponse = await fetch(`${window.routes.cartUrl}.js`, { headers: { Accept: 'application/json' } })
  const cart = await cartResponse.json()

  const desiredBySampleVariant = new Map()
  for (const line of cart.items) {
    const sampleVariantId = line.properties?._sample_variant_id
    if (!sampleVariantId) continue
    const key = String(sampleVariantId)
    desiredBySampleVariant.set(key, (desiredBySampleVariant.get(key) || 0) + 1)
  }

  const sampleLines = []
  cart.items.forEach((line, index) => {
    if (line.properties?._is_free_sample === 'true') {
      sampleLines.push({ line, position: index + 1 })
    }
  })

  // Self-heal: if the same sample variant somehow has more than one line,
  // zero out everything past the first and let the next pass re-tally it.
  const seenVariants = new Set()
  for (const entry of sampleLines) {
    const variantId = String(entry.line.variant_id)
    if (seenVariants.has(variantId)) {
      sampleAddonDispatchUpdate(await sampleAddonChangeLine(entry.position, 0))
      return
    }
    seenVariants.add(variantId)
  }

  // Bring each existing sample line to the quantity its parent lines call for.
  for (const entry of sampleLines) {
    const variantId = String(entry.line.variant_id)
    const wanted = desiredBySampleVariant.get(variantId) || 0
    desiredBySampleVariant.delete(variantId)
    if (entry.line.quantity !== wanted) {
      sampleAddonDispatchUpdate(await sampleAddonChangeLine(entry.position, wanted))
      return
    }
  }

  // Anything left wants a sample that has no line yet.
  for (const [variantId, wanted] of desiredBySampleVariant) {
    if (wanted <= 0) continue
    sampleAddonDispatchUpdate(await sampleAddonAddLine(Number(variantId), wanted))
    return
  }
}

async function reconcileSampleAddons() {
  if (sampleAddonReconcile.running) {
    sampleAddonReconcile.queued = true
    return
  }
  sampleAddonReconcile.running = true
  try {
    await runSampleAddonReconcilePass()
  } catch (error) {
    console.error('Sample addon reconcile error:', error)
  } finally {
    sampleAddonReconcile.running = false
    if (sampleAddonReconcile.queued) {
      sampleAddonReconcile.queued = false
      reconcileSampleAddons()
    }
  }
}

document.addEventListener('cart:updated', () => reconcileSampleAddons())
