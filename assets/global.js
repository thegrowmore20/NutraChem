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
