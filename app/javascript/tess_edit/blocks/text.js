import { align, padding, typography } from "tess_edit/blocks/fields"

const doc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

export function plainText(content) {
  if (!content) return ""
  if (content.type === "text") return content.text || ""
  return (content.content || []).map(plainText).join(" ")
}

export default {
  type: "text",
  name: "Text",
  icon: "text",
  roles: ["content"],
  // The canvas edits data.content with Tiptap on double-click.
  richText: "data.content",
  defaults: () => ({ attributes: { padding: "10px 25px" }, data: { content: doc("Write something here. Use {{ variables }} for Liquid.") } }),
  fields: [
    { title: "Text", fields: [align, padding, { key: "attributes.container-background-color", label: "Background", type: "color" }, { key: "attributes.height", label: "Height", type: "size" }] },
    typography()
  ],
  hint: "Double-click the text on the canvas to edit it.",
  label(node) {
    const text = plainText(node.data.content).trim()
    return text ? `Text · ${text.slice(0, 32)}` : "Text"
  },
  palette: [
    { key: "text", label: "Text", category: "content" },
    {
      key: "heading",
      label: "Heading",
      icon: "heading",
      category: "content",
      create: ({ createNode }) => createNode("text", { attributes: { "font-size": "24px", "font-weight": "700", "line-height": "1.3" }, data: { content: doc("Heading") } })
    }
  ],
  render: {
    mjml: (node, { element, richText }) => element("mj-text", node, richText(node.data.content))
  }
}
