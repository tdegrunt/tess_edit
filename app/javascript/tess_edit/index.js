// Entry point. In the host app:
//
//   import { application } from "controllers/application"
//   import { registerTessEdit } from "tess_edit"
//   registerTessEdit(application)

import EditorController from "tess_edit/controllers/editor_controller"

export { EditorController }
export { toMjml } from "tess_edit/export/mjml"
export { compile } from "tess_edit/export/compile"
export { richTextToHtml } from "tess_edit/export/richtext"
export { createDocument, createNode, normalize } from "tess_edit/core/document"
export { registerBlock, registerCategory, getBlock, blockTypes, paletteItems } from "tess_edit/core/registry"
export * as fields from "tess_edit/blocks/fields"
export { starterDocument } from "tess_edit/core/starter"

export function registerTessEdit(application, identifier = "tess-edit") {
  application.register(identifier, EditorController)
}
