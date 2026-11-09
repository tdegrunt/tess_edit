// A palette source registered by the demo app the way a host app adds its
// own: snippets from the server (SnippetsController), inserted as a copy whose
// blocks know the block they are a copy of. Only in editors that are given a
// snippetsUrl in their options (?snippets=1).

import { registerPaletteSource, renumber } from "tess_edit"

registerPaletteSource({
  key: "snippets",
  label: "Snippets",
  items: async (editor) => {
    if (!editor.options.snippetsUrl) return null
    const response = await fetch(editor.options.snippetsUrl, { headers: { Accept: "application/json" } })
    if (!response.ok) throw new Error(`Loading the snippets failed (${response.status})`)
    return (await response.json()).snippets.map((snippet) => ({ ...snippet, type: snippet.block.type }))
  },
  create: async (item) => renumber(item.block, { origin: true })
})
