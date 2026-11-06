// The document is a plain JSON tree:
//   { id, type, attributes: {}, data: {}, children: [] }
// `attributes` map one-to-one onto MJML attributes, `data` holds everything else
// (rich text, Liquid expressions, link lists). All functions here are pure apart
// from the mutating helpers, which change the tree they are given in place.

import { getBlock, paletteItem, typesForRoles } from "tess_edit/core/registry"

export const VERSION = 1

export function uid() {
  return "b" + Math.random().toString(36).slice(2, 9)
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// Builds a node of `type` with the block's defaults; `overrides` are merged in.
export function createNode(type, overrides = {}) {
  const definition = getBlock(type)
  if (!definition) throw new Error(`Unknown block type: ${type}`)
  const defaults = definition.defaults ? definition.defaults() : {}
  return {
    id: uid(),
    type,
    attributes: { ...(defaults.attributes || {}), ...(overrides.attributes || {}) },
    data: { ...(defaults.data || {}), ...(overrides.data || {}) },
    children: overrides.children || defaults.children || []
  }
}

export function createDocument() {
  return { version: VERSION, ...createNode("root") }
}

// Calls fn(node, parent, index, depth) for every node, depth first.
export function walk(node, fn, parent = null, index = 0, depth = 0) {
  if (fn(node, parent, index, depth) === false) return
  ;(node.children || []).forEach((child, i) => walk(child, fn, node, i, depth + 1))
}

export function find(doc, id) {
  let result = null
  walk(doc, (node, parent, index) => {
    if (result) return false
    if (node.id === id) {
      result = { node, parent, index }
      return false
    }
  })
  return result
}

// Ancestors of `id`, nearest first (not including the node itself).
export function ancestors(doc, id) {
  const path = []
  const visit = (node, trail) => {
    if (node.id === id) {
      path.push(...trail.slice().reverse())
      return true
    }
    return (node.children || []).some((child) => visit(child, [...trail, node]))
  }
  visit(doc, [])
  return path
}

export function isDescendant(doc, ancestorId, id) {
  return ancestors(doc, id).some((node) => node.id === ancestorId)
}

// The roles that may be placed directly inside the node with `parentId`.
// Loop and Condition ("inherit") are transparent: they accept what their
// nearest other ancestor accepts, except columns.
export function acceptedRoles(doc, parentId) {
  const hit = find(doc, parentId)
  if (!hit) return []
  const accepts = getBlock(hit.node.type)?.accepts
  if (accepts !== "inherit") return accepts || []
  const owner = ancestors(doc, parentId).find((node) => getBlock(node.type)?.accepts !== "inherit")
  return (owner ? getBlock(owner.type).accepts : getBlock("root").accepts).filter((role) => role !== "column")
}

// The block types that may be placed directly inside the node with `parentId`.
export function accepted(doc, parentId) {
  return typesForRoles(acceptedRoles(doc, parentId))
}

export function canInsert(doc, parentId, type) {
  return accepted(doc, parentId).includes(type)
}

// Whether children of `parentId` flow horizontally (columns in a section).
export function isHorizontal(doc, parentId) {
  const hit = find(doc, parentId)
  return hit ? !!getBlock(hit.node.type)?.horizontal : false
}

// Gives a node and all of its descendants fresh ids, for duplicating and pasting.
export function renumber(node) {
  const copy = clone(node)
  walk(copy, (n) => {
    n.id = uid()
  })
  return copy
}

export function insert(doc, parentId, index, node) {
  const hit = find(doc, parentId)
  if (!hit) throw new Error(`No node ${parentId}`)
  hit.node.children ||= []
  const at = Math.max(0, Math.min(index ?? hit.node.children.length, hit.node.children.length))
  hit.node.children.splice(at, 0, node)
  return node
}

export function remove(doc, id) {
  const hit = find(doc, id)
  if (!hit || !hit.parent) return null
  hit.parent.children.splice(hit.index, 1)
  return hit
}

// Moves node `id` to position `index` in `parentId`. `index` is counted in the
// target's children as they are before the move.
export function move(doc, id, parentId, index) {
  if (id === parentId || isDescendant(doc, id, parentId)) return false
  const hit = find(doc, id)
  if (!hit || !hit.parent) return false
  let at = index
  if (hit.parent.id === parentId && hit.index < index) at -= 1
  hit.parent.children.splice(hit.index, 1)
  insert(doc, parentId, at, hit.node)
  return true
}

export function duplicate(doc, id) {
  const hit = find(doc, id)
  if (!hit || !hit.parent) return null
  const copy = renumber(hit.node)
  hit.parent.children.splice(hit.index + 1, 0, copy)
  return copy
}

// Sets a value on a node. `key` is "attributes.padding" or "data.subject".
// An empty string removes an attribute, so MJML falls back to its default.
export function setValue(doc, id, key, value) {
  const hit = find(doc, id)
  if (!hit) return
  const [scope, name] = key.split(".")
  hit.node[scope] ||= {}
  if (scope === "attributes" && (value === "" || value === null || value === undefined)) {
    delete hit.node[scope][name]
  } else {
    hit.node[scope][name] = value
  }
}

export function getValue(node, key) {
  const [scope, name] = key.split(".")
  return node[scope]?.[name]
}

// Light validation of a document read from storage or an import.
export function normalize(input) {
  const doc = typeof input === "string" ? JSON.parse(input) : clone(input)
  // The root block was called "page" before; such documents still load.
  if (doc?.type === "page") doc.type = "root"
  if (!doc || doc.type !== "root") throw new Error("Not a TessEdit document: the top node must be the root block")
  walk(doc, (node) => {
    if (!getBlock(node.type)) throw new Error(`Unknown block type: ${node.type}`)
    node.id ||= uid()
    node.attributes ||= {}
    node.data ||= {}
    node.children ||= []
  })
  doc.version ||= VERSION
  return doc
}

// The node (or small tree) a Blocks panel tile creates.
export function createFromPalette(key) {
  const item = paletteItem(key)
  if (!item) throw new Error(`Unknown palette item: ${key}`)
  return item.create({ createNode })
}

// The block type of the node a tile creates, used to check where it may go.
export function itemType(key) {
  return paletteItem(key)?.type || null
}
