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
//                                      // a field's visible: (node, editor) => boolean shows it only when it applies,
//                                      // and a group only when one of its fields does;
//                                      // imageField(key, label, idKey) (core/media.js) makes an image field;
//                                      // a "code" field takes language: "html" (default) or "css"
//     hint: "Shown at the top of Inspect.",
//     label: (node) => `Product · ${node.data.sku}`,   // optional, for Layers and the canvas
//     richText: "data.content",        // optional: a Tiptap JSON value edited on the canvas by double-click
//     palette: [{ key, label, icon, category, create: ({ createNode }) => node }],  // optional
//     kits: ["email"],                 // the kits it is part of, default ["email"]
//     unique: true,                    // optional: at most one per document, like Content
//     layout: "free",                  // optional, on a container: its children are placed by
//                                      // data.x and data.y, dragged on the canvas (ui/free_layout.js)
//     resize: { width: "data.width", height: "data.height" },
//                                      // optional, in a free layout: the keys of its size, for a resize handle
//     render: { mjml: (node, ctx) => "<mj-text …>" } // one per format of its kits:
//                                      // mjml (export/mjml.js), html (export/html.js)
//   })
//
// Roles: "body" (inside the page or a wrapper: sections, heroes), "wrapper",
// "column" (inside a section) and "content" (inside a column or hero). A
// container accepts the roles in its `accepts`; Loop and Condition use
// "inherit" and accept what their nearest other container accepts.
//
// Without a `palette`, a block with a `category` gets one tile in the Blocks
// panel; `palette: []` gives it none. Registering a type again replaces it.
//
// Kits: what the editor makes. A kit has its own root block and the blocks
// that name it in their `kits`, and decides what the canvas shows and what
// the editor outputs:
//
//   registerKit({
//     key: "note",                     // data-tess-edit-kit-value; blocks name it in `kits`
//     name: "Note",                    // shown in the top bar
//     root: "note",                    // the type of its root block, unique to the kit
//     starter: () => doc,              // the sample document
//     devices: [{ key, icon, title, width }],  // optional: canvas widths in the top bar
//     previewTitle: "…",               // the Preview button's title
//     canvas: async (doc, { editor, compileUrl, signal }) => ({ html, errors }),
//                                      // the canvas's HTML, with the tess-<id> and tessph-<id>
//                                      // classes when editor is true; null when aborted
//     outputs: async (doc, { compileUrl, signal }) => ({ outputs: { html: "…" }, errors }),
//                                      // what the editor stores besides the JSON (the inputs,
//                                      // the change event and the Code dialog); null when aborted
//     notes: { html: "…" },            // optional: what each output is, in the Code dialog
//     errors: "The email could not be compiled"  // shown before the reasons
//   })
//
// The built-in kit is "email" (MJML, compiled to HTML on the server, see
// kits/email.js). A host adds its own kit with its root block and blocks,
// and brings TessEdit's blocks into it with extendBlock:
//
//   extendBlock("text", { kits: ["note"], render: { note: (node, ctx) => "<div>…</div>" } })
//
// which adds the kits and render hooks (and any fields, in groups of their
// own) to the block as it is registered, also when another gem replaced it.

import { builtinBlocks, builtinCategories } from "tess_edit/blocks/builtin"
import { builtinKits } from "tess_edit/kits/builtin"

const definitions = new Map()
const categoryList = new Map()
const kitList = new Map()
const sourceList = new Map()

export const DEFAULT_KIT = "email"

export function registerKit(kit) {
  const { key, name, root, canvas, outputs } = kit || {}
  if (!key || !name) throw new Error("A kit needs a key and a name")
  if (!root) throw new Error(`Kit ${key} needs a root block type`)
  if (typeof canvas !== "function" || typeof outputs !== "function") throw new Error(`Kit ${key} needs canvas(doc, options) and outputs(doc, options)`)
  kitList.set(key, { devices: null, notes: {}, errors: `The ${name} could not be rendered`, ...kit })
  return kitList.get(key)
}

export function getKit(key = DEFAULT_KIT) {
  return kitList.get(key)
}

export function kits() {
  return [...kitList.values()]
}

// The kit a document belongs to, from its root block
export function kitOf(doc) {
  return kits().find((kit) => kit.root === doc?.type)
}

function inKit(definition, kit) {
  return !kit || definition.kits.includes(kit)
}

// Tiles the host app gives at run time, such as reusable content from its
// server, in a section of their own at the bottom of the Blocks panel:
//
//   registerPaletteSource({
//     key: "snippets",
//     label: "Snippets",
//     items: async (editor) => [{ key, label, type, description, version }],
//                                      // null leaves the section out (e.g. not for this editor);
//                                      // `type` is the block type create gives, to show where it fits
//     create: async (item, editor) => node   // the node inserted, e.g. with renumber(block, { origin: true })
//   })
//
// A tile is dragged onto the canvas or clicked like any other. Its node goes
// where its type fits; a container that takes what its parent takes
// ("inherit") also needs its children to fit there.
export function registerPaletteSource(source) {
  const { key, label, items, create } = source || {}
  if (!key || !label) throw new Error("A palette source needs a key and a label")
  if (typeof items !== "function" || typeof create !== "function") throw new Error(`Palette source ${key} needs items(editor) and create(item, editor)`)
  sourceList.set(key, { ...source })
  return sourceList.get(key)
}

export function paletteSources() {
  return [...sourceList.values()]
}

export function registerCategory({ key, label, order = 100 }) {
  if (!key || !label) throw new Error("A category needs a key and a label")
  categoryList.set(key, { key, label, order })
}

export function registerBlock(definition) {
  const { type, name, render } = definition || {}
  if (!type || typeof type !== "string") throw new Error("A block needs a type")
  if (!name) throw new Error(`Block ${type} needs a name`)
  if (!Object.values(render || {}).some((hook) => typeof hook === "function")) throw new Error(`Block ${type} needs render.mjml(node, ctx) or render.html(node, ctx)`)
  if (!kits().some((kit) => kit.root === type) && !(definition.roles || []).length) throw new Error(`Block ${type} needs roles, e.g. ["content"]`)

  const palette = (definition.palette ?? (definition.category ? [{ key: type, label: name, icon: definition.icon, category: definition.category }] : [])).map((item) => ({
    icon: definition.icon,
    category: definition.category,
    create: ({ createNode }) => createNode(type),
    ...item,
    type
  }))
  definitions.set(type, { roles: [], kits: [DEFAULT_KIT], ...definition, palette })
  return definitions.get(type)
}

// Adds kits, render hooks and field groups to a registered block
export function extendBlock(type, { kits = [], render = {}, fields = [] } = {}) {
  const definition = definitions.get(type)
  if (!definition) throw new Error(`No block ${type} to extend`)
  definitions.set(type, {
    ...definition,
    kits: [...new Set([...definition.kits, ...kits])],
    render: { ...definition.render, ...render },
    fields: [...(definition.fields || []), ...fields]
  })
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

// The block types that may go where the given roles are accepted, of a kit's
// blocks when one is given.
export function typesForRoles(roles, kit) {
  return [...definitions.values()].filter((definition) => inKit(definition, kit) && definition.roles.some((role) => roles.includes(role))).map((definition) => definition.type)
}

export function categories() {
  return [...categoryList.values()].sort((a, b) => a.order - b.order)
}

// Tiles for the Blocks panel, in registration order, of a kit's blocks when
// one is given.
export function paletteItems(kit) {
  return [...definitions.values()].filter((definition) => inKit(definition, kit)).flatMap((definition) => definition.palette)
}

export function paletteItem(key) {
  return paletteItems().find((item) => item.key === key)
}

export function label(node) {
  const definition = getBlock(node.type)
  return definition?.label?.(node) || definition?.name || node.type
}

builtinKits.forEach(registerKit)
builtinCategories.forEach(registerCategory)
builtinBlocks.forEach(registerBlock)
