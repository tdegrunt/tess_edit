// Translations from the host app, for Liquid's t filter (as Liquidum has it):
//
//   {{ '.greeting' | t }}   {{ "order.shipped" | t: name: order.customer.name }}
//
// The editor shows what they say in a language chosen in its top bar, lists
// every language's text, edits them, and turns selected text into one. The
// editor's translationsUrl answers:
//
//   GET ?keys=.greeting,order.shipped →
//     { locales: ["en", "nl"],
//       translations: { ".greeting": { en: { value: "Hello", source: "…", url: "…" }, nl: null }, … },
//       suggestions: [".greeting", ".signature", …] }
//
// with the keys asked for and the ones suggested while typing {{ ' (those
// with their translations too, to show them as the suggestions). A source
// says where a text comes from and url where to edit it; a missing text is
// null. Saving one:
//
//   PATCH { key, locale, value } → { key, translation: { en: …, nl: … } }
//
// which answers 422 with { errors: [...] } when it can't be saved.

// A t filter on a quoted key, with what follows it in the tag (its arguments)
const CALL = /\{\{-?\s*(["'])([^"'{}|]+?)\1\s*\|\s*t(?:ranslate)?\b((?:(?!\}\}).)*?)-?\}\}/g

// The t filters in a text: [{ start, end, key, locale, text }]; locale when
// the call names one (t: locale: 'nl')
export function translationCalls(text) {
  if (typeof text !== "string" || !text.includes("{{")) return []
  return Array.from(text.matchAll(CALL), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    key: match[2].trim(),
    locale: match[3].match(/\blocale:\s*["']([\w-]+)["']/)?.[1] || null,
    text: match[0]
  }))
}

// Every key in a document's texts and settings
export function keysIn(value, keys = new Set()) {
  if (typeof value === "string") {
    for (const call of translationCalls(value)) keys.add(call.key)
  } else if (Array.isArray(value)) {
    value.forEach((item) => keysIn(item, keys))
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => keysIn(item, keys))
  }
  return keys
}

// A key for a text, in the template's own scope: "Thanks for your order!" → ".thanks_for_your_order"
export function suggestKey(text) {
  const words = String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\{\{.*?\}\}|\{%.*?%\}/g, " ")
    .match(/[a-z0-9]+/g) || []
  return `.${words.slice(0, 5).join("_") || "text"}`
}

export function validKey(key) {
  return /^\.?[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(key || "")
}

// The tag that translates a key
export function translationTag(key) {
  return `{{ '${key}' | t }}`
}

// The key being typed at the caret, in a t filter to be: "Hi {{ '.gr" →
// { start: 7, partial: ".gr", quote: "'" }, with start where the key begins
export function keyToken(before) {
  const match = before.match(/\{\{-?\s*(["'])([\w.-]*)$/)
  if (!match) return null
  return { start: before.length - match[2].length, partial: match[2], quote: match[1] }
}

// The text that replaces the key being typed for a chosen key: the key, its
// closing quote and the t filter, unless they're there already
export function keyCompletion(key, quote, after = "") {
  if (after.startsWith(quote)) return key
  return `${key}${quote} | t${/^\s*-?\}\}/.test(after) ? "" : " }}"}`
}

// The translations the editor has from the host app, by key
export class Translations {
  constructor(url, { fetch: fetcher = (...args) => fetch(...args) } = {}) {
    this.url = url
    this.fetch = fetcher
    this.locales = []
    this.entries = new Map()
    this.suggestions = []
    this.loaded = false
    this.started = false
    this.requested = new Set()
    this.error = null
    this.listeners = new Set()
  }

  get enabled() {
    return Boolean(this.url)
  }

  // Calls fn whenever translations arrive or change
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  changed() {
    this.listeners.forEach((fn) => fn())
  }

  // Asks for the keys it doesn't have yet (the first time, for the suggestions too)
  async load(keys = []) {
    if (!this.enabled) return
    const missing = [...keys].filter((key) => !this.entries.has(key) && !this.requested.has(key))
    if (this.started && !missing.length) return
    this.started = true
    missing.forEach((key) => this.requested.add(key))
    const url = new URL(this.url, window.location.href)
    if (missing.length) url.searchParams.set("keys", missing.join(","))
    try {
      const response = await this.fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      if (!response.ok) throw new Error(`Loading the translations failed (${response.status} ${response.statusText})`)
      const result = await response.json()
      this.locales = result.locales || []
      for (const [key, entry] of Object.entries(result.translations || {})) this.entries.set(key, entry || {})
      // Keys asked for that the host doesn't answer are missing in every language
      for (const key of missing) if (!this.entries.has(key)) this.entries.set(key, {})
      this.suggestions = result.suggestions || this.suggestions
      this.loaded = true
      this.error = null
    } catch (error) {
      this.error = error.message
      // Asked for again next time
      this.started = false
      this.requested.clear()
    }
    this.changed()
  }

  has(key) {
    return this.entries.has(key)
  }

  // { value, source, url } or null when it's missing
  get(key, locale) {
    return this.entries.get(key)?.[locale] || null
  }

  value(key, locale) {
    const value = this.get(key, locale)?.value
    return typeof value === "string" ? value : null
  }

  // The languages without a text for the key
  missing(key) {
    return this.locales.filter((locale) => this.value(key, locale) === null)
  }

  async save(key, locale, value) {
    const token = document.querySelector("meta[name='csrf-token']")?.content
    const response = await this.fetch(new URL(this.url, window.location.href), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
      body: JSON.stringify({ key, locale, value }),
      credentials: "same-origin"
    })
    const result = (response.headers?.get("Content-Type") || "").includes("json") ? await response.json() : {}
    if (!response.ok) throw new Error(result.errors?.join(", ") || `Saving the translation failed (${response.status} ${response.statusText})`)
    this.entries.set(key, result.translation || {})
    if (!this.suggestions.includes(key) && key.startsWith(".")) this.suggestions = [...this.suggestions, key].sort()
    this.changed()
    return result.translation
  }
}
