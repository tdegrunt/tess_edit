// The built-in blocks, registered by core/registry.js in this order. The
// order is also the order of tiles in the Blocks panel.

import page from "tess_edit/blocks/page"
import wrapper from "tess_edit/blocks/wrapper"
import section from "tess_edit/blocks/section"
import column from "tess_edit/blocks/column"
import hero from "tess_edit/blocks/hero"
import text from "tess_edit/blocks/text"
import image from "tess_edit/blocks/image"
import button from "tess_edit/blocks/button"
import divider from "tess_edit/blocks/divider"
import spacer from "tess_edit/blocks/spacer"
import social from "tess_edit/blocks/social"
import navbar from "tess_edit/blocks/navbar"
import raw from "tess_edit/blocks/raw"
import loop from "tess_edit/blocks/loop"
import condition from "tess_edit/blocks/condition"

export const builtinCategories = [
  { key: "layout", label: "Layout", order: 10 },
  { key: "content", label: "Content", order: 20 },
  { key: "liquid", label: "Liquid", order: 30 }
]

export const builtinBlocks = [page, section, column, wrapper, hero, text, image, button, divider, spacer, social, navbar, raw, loop, condition]
