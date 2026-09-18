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

  const button = form.querySelector('button[type="submit"]')
  button?.classList.add('is-loading')
  button?.setAttribute('disabled', 'disabled')

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
      button?.classList.remove('is-loading')
      button?.removeAttribute('disabled')
    })
})
