// The variables a template can use, from the host app. The editor's
// variablesUrl answers one level at a time:
//
//   GET ?path=order.customer → { path, variables: [{ name, label, type, hint, collection, children }] }
//
// with the roots (order, …) for an empty path. `children` says a variable has
// variables of its own; a `collection` is a list of them. The path goes into
// a collection's elements: order.order_lines.product. Liquidum's
// VariablesController answers this way.
//
// In Liquid a collection's elements are reached through a Loop block's
// variable ({% for line in order.order_lines %} → line.product) or with
// first and last (order.order_lines.first.product), so those are resolved to
// such a path before asking.

import { ancestors } from "tess_edit/core/document"

// The members Liquid gives every collection
export const COLLECTION_MEMBERS = [
  { name: "first", label: "First", type: "object", children: true },
  { name: "last", label: "Last", type: "object", children: true },
  { name: "size", label: "Number of items", type: "integer", children: false }
]

const ELEMENT = new Set(["first", "last"])

export class Variables {
  constructor(url, { fetch: fetcher = (...args) => fetch(...args) } = {}) {
    this.url = url
    this.fetch = fetcher
    this.levels = new Map()
  }

  get enabled() {
    return Boolean(this.url)
  }

  // The host's variables at a path (as the endpoint takes it), cached
  at(path) {
    if (!this.levels.has(path)) {
      const request = this.request(path)
      request.catch(() => this.levels.delete(path))
      this.levels.set(path, request)
    }
    return this.levels.get(path)
  }

  async request(path) {
    const url = new URL(this.url, window.location.href)
    if (path) url.searchParams.set("path", path)
    const response = await this.fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Loading the variables failed (${response.status} ${response.statusText})`)
    return (await response.json()).variables || []
  }

  // The variables at a path as written in the template, e.g. "line.product"
  // in a loop over order.order_lines, or "order.order_lines" (a collection:
  // first, last and size). scope is from loopScope.
  async options(path, scope = []) {
    const names = path ? path.split(".") : []
    if (!names.length) return [...scope.map(loopVariable), ...(await this.at(""))]

    const variable = await this.variable(names, scope)
    if (!variable?.children) return []
    if (variable.collection) return COLLECTION_MEMBERS
    return this.at(resolve(names, scope))
  }

  // What the last name of a path is: a variable with children, a collection, …
  async variable(names, scope) {
    const last = names[names.length - 1]
    const parent = names.slice(0, -1)
    if (!parent.length) {
      const own = scope.find((entry) => entry.variable === last)
      if (own) return loopVariable(own)
    } else if (ELEMENT.has(last)) {
      const collection = await this.variable(parent, scope)
      return collection?.collection ? { name: last, children: true } : null
    }
    const siblings = parent.length ? await this.options(parent.join("."), scope) : await this.options("", scope)
    return siblings.find((variable) => variable.name === last)
  }
}

function loopVariable({ variable, collection }) {
  return { name: variable, label: `Each of ${collection}`, type: "object", children: true, loop: true }
}

// The path the host knows a template's path by: loop variables become their
// collection, and first and last go into the collection's elements.
export function resolve(names, scope = []) {
  let resolved = [...names]
  // Inner loops first: their collection can start with an outer loop's variable
  for (let i = 0; i < scope.length; i++) {
    for (const { variable, collection } of scope) {
      if (resolved[0] === variable) resolved = [...collection.split("."), ...resolved.slice(1)]
    }
  }
  return resolved.filter((name) => !ELEMENT.has(name) && !/^\d+$/.test(name)).join(".")
}

// The loop variables a block can use: its Loop blocks, the innermost first.
export function loopScope(doc, id) {
  return ancestors(doc, id)
    .filter((node) => node.type === "loop")
    .map((node) => ({ variable: node.data.variable || "item", collection: node.data.collection || "items" }))
    .filter(({ variable, collection }) => /^\w+$/.test(variable) && collection)
}

// The variable path being written at the caret, if any:
//   "Hello {{ order.cus"  → { start: 9, path: "order.cus", tag: "{{" }
// In "output" mode only inside {{ … }} or {% … %} (tag says which); in
// "expression" mode (a Loop's collection, a Condition) anywhere, with no tag.
// Not after a filter's | or in a quoted string.
export function liquidToken(before, mode = "output") {
  let expression = before
  let tag = null
  if (mode === "output") {
    const output = before.lastIndexOf("{{")
    const open = Math.max(output, before.lastIndexOf("{%"))
    if (open < 0 || Math.max(before.lastIndexOf("}}"), before.lastIndexOf("%}")) > open) return null
    tag = open === output ? "{{" : "{%"
    expression = before.slice(open + 2)
  }
  if ((expression.match(/["']/g) || []).length % 2) return null

  const match = expression.match(/(?:^|[^\w.])([A-Za-z_][\w]*(?:\.[\w]*)*)?$/)
  if (!match) return null
  const path = match[1] || ""
  const start = before.length - path.length
  if (/\|\s*$/.test(before.slice(0, start))) return null
  return { start, path, tag }
}

// The text that replaces a token's last name for a chosen variable: its name,
// then a dot to go on with its variables, or the end of a {{ tag. `before` is
// the text before the token, `after` the text after the caret. For a Loop's
// collection (`collection: true`) a collection is where the path ends.
export function completion(variable, { tag = null, before = "", after = "", collection = false } = {}) {
  // "{{order" reads better as "{{ order"
  const space = /\{[{%]-?$/.test(before) ? " " : ""
  if (variable.children && !(collection && variable.collection)) return { text: `${space}${variable.name}.`, more: true }
  const close = tag === "{{" && !/^\s*-?\}\}/.test(after) && !/^\s*\|/.test(after)
  return { text: `${space}${variable.name}${close ? " }}" : ""}`, more: false }
}
