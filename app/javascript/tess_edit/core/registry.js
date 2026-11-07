// The block registry. Every block, built-in or added by a host app, is one
// definition registered here:
//
//   registerBlock({
//     type: "product",                 // stored in the document JSON
//     name: "Product",                 // shown in Layers, Inspect and on the canvas
//     icon: "image",                   // a built-in icon name, or SVG markup for a 24×24 viewBox
//     roles: ["content"],              // where it may be placed, see below
//     accepts: undefined,              // roles it takes as children, "inherit", or undefined for a leaf
//     defaults: () => ({ attributes: {}, data: {} }),
//     fields: [{ title: "Product", fields: [{ key: "data.sku", label: "SKU", type: "text" }] }],
//                                      // a field's visible: (node, editor) => boolean shows it only when it applies;
//                                      // imageField(key, label, idKey) (core/media.js) makes an image field;
//                                      // a "code" field takes language: "html" (default) or "css"
//     hint: "Shown at the top of Inspect.",
//     label: (node) => `Product · ${node.data.sku}`,   // optional, for Layers and the canvas
//     richText: "data.content",        // optional: a Tiptap JSON value edited on the canvas by double-click
//     palette: [{ key, label, icon, category, create: ({ createNode }) => node }],  // optional
//     render: { mjml: (node, ctx) => "<mj-text …>" } // ctx: see export/mjml.js
//   })
//
// Roles: "body" (inside the page or a wrapper: sections, heroes), "wrapper",
// "column" (inside a section) and "content" (inside a column or hero). A
// container accepts the roles in its `accepts`; Loop and Condition use
// "inherit" and accept what their nearest other container accepts.
//
// Without a `palette`, a block with a `category` gets one tile in the Blocks
// panel; `palette: []` gives it none. Registering a type again replaces it.

import { builtinBlocks, builtinCategories } from "tess_edit/blocks/builtin"

const definitions = new Map()
const categoryList = new Map()

export function registerCategory({ key, label, order = 100 }) {
  if (!key || !label) throw new Error("A category needs a key and a label")
  categoryList.set(key, { key, label, order })
}

export function registerBlock(definition) {
  const { type, name, render } = definition || {}
  if (!type || typeof type !== "string") throw new Error("A block needs a type")
  if (!name) throw new Error(`Block ${type} needs a name`)
  if (typeof render?.mjml !== "function") throw new Error(`Block ${type} needs render.mjml(node, ctx)`)
  if (type !== "root" && !(definition.roles || []).length) throw new Error(`Block ${type} needs roles, e.g. ["content"]`)

  const palette = (definition.palette ?? (definition.category ? [{ key: type, label: name, icon: definition.icon, category: definition.category }] : [])).map((item) => ({
    icon: definition.icon,
    category: definition.category,
    create: ({ createNode }) => createNode(type),
    ...item,
    type
  }))
  definitions.set(type, { roles: [], ...definition, palette })
  return definitions.get(type)
}

export function getBlock(type) {
  return definitions.get(type)
}

export function blockTypes() {
  return [...definitions.keys()]
}

export function isContainer(type) {
  return !!getBlock(type)?.accepts
}

// The block types that may go where the given roles are accepted.
export function typesForRoles(roles) {
  return [...definitions.values()].filter((definition) => definition.roles.some((role) => roles.includes(role))).map((definition) => definition.type)
}

export function categories() {
  return [...categoryList.values()].sort((a, b) => a.order - b.order)
}

// Tiles for the Blocks panel, in registration order.
export function paletteItems() {
  return [...definitions.values()].flatMap((definition) => definition.palette)
}

export function paletteItem(key) {
  return paletteItems().find((item) => item.key === key)
}

export function label(node) {
  const definition = getBlock(node.type)
  return definition?.label?.(node) || definition?.name || node.type
}

builtinCategories.forEach(registerCategory)
builtinBlocks.forEach(registerBlock)
