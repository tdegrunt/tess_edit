import { align, padding } from "tess_edit/blocks/fields"

export default {
  type: "image",
  name: "Image",
  icon: "image",
  category: "content",
  roles: ["content"],
  defaults: () => ({ attributes: { src: "https://placehold.co/1200x600/e5e7eb/9ca3af.png?text=Image", alt: "", padding: "10px 25px" } }),
  fields: [
    {
      title: "Image",
      fields: [
        { key: "attributes.src", label: "Image URL", type: "text" },
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
