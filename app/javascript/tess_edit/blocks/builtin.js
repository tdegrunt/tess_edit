// TessEdit's own blocks, registered by core/registry.js in this order, the
// order of their tiles in the Blocks panel unless a kit orders them. They are
// part of no kit: a kit takes them in with extendBlock, with how they render
// in it (see core/registry.js).

import section from "tess_edit/blocks/section"
import column from "tess_edit/blocks/column"
import content from "tess_edit/blocks/content"
import text from "tess_edit/blocks/text"
import image from "tess_edit/blocks/image"
import button from "tess_edit/blocks/button"
import divider from "tess_edit/blocks/divider"
import spacer from "tess_edit/blocks/spacer"
import raw from "tess_edit/blocks/raw"
import loop from "tess_edit/blocks/loop"
import condition from "tess_edit/blocks/condition"
import assign from "tess_edit/blocks/assign"
import { table, tableCell, tableRow } from "tess_edit/blocks/table"

export const builtinCategories = [
  { key: "layout", label: "Layout", order: 10 },
  { key: "content", label: "Content", order: 20 },
  { key: "liquid", label: "Liquid", order: 30 }
]

export const builtinBlocks = [section, column, content, text, image, button, divider, spacer, raw, loop, condition, assign, table, tableRow, tableCell]
