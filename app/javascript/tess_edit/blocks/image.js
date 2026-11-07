import { align, padding } from "tess_edit/blocks/fields"
import { imageSource } from "tess_edit/core/media"

export default {
  type: "image",
  name: "Image",
  icon: "image",
  category: "content",
  roles: ["content"],
  defaults: () => ({ attributes: { src: "https://placehold.co/1200x600/e5e7eb/9ca3af.png?text=Image", alt: "", padding: "10px 25px" } }),
  // A new image from the Blocks panel starts as an uploaded one (when the host keeps images)
  palette: [{ key: "image", label: "Image", create: ({ createNode }) => createNode("image", { data: { source: "upload" } }) }],
  fields: [
    {
      title: "Image",
      fields: [
        // Uploaded images only when the host keeps images (the editor's mediaUrl)
        { key: "data.source", label: "Source", type: "segmented", options: [{ value: "upload", label: "Uploaded" }, { value: "web", label: "Web" }], visible: (node, editor) => editor.media?.enabled },
        { key: "data.image", label: "Image", type: "media", visible: (node, editor) => imageSource(node, editor) === "upload" },
        { key: "attributes.src", label: "Image URL", type: "text", visible: (node, editor) => imageSource(node, editor) === "web" },
        { key: "attributes.alt", label: "Alt text", type: "text" },
        { key: "attributes.href", label: "Link", type: "text" },
        { key: "attributes.width", label: "Width", type: "size", placeholder: "Full" },
        { key: "attributes.height", label: "Height", type: "size", placeholder: "Auto" },
        align,
        padding
      ]
    },
    { title: "Border", collapsed: true, fields: [{ key: "attributes.border", label: "Border", type: "text" }, { key: "attributes.border-radius", label: "Radius", type: "size" }, { key: "attributes.container-background-color", label: "Background", type: "color" }] }
  ],
  render: { mjml: (node, { element }) => element("mj-image", node) }
}
