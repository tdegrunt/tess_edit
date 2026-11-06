// A custom block, registered by the demo app the way a host app adds its own.
// It marks where a template's own content goes in a layout (Nuntius will ship
// the real one). Like Loop and Condition it adds no HTML of its own and takes
// whatever its parent takes, so it works inside a column or at the top level.

export default {
  type: "content",
  name: "Content",
  icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke-dasharray="3 2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  category: "layout",
  roles: ["body", "content"],
  accepts: "inherit",
  defaults: () => ({ attributes: {}, data: {} }),
  fields: [],
  hint: "The template's own content goes here. What you put inside is example content for designing the layout; a template replaces it with its own.",
  label: () => "Template content",
  render: {
    mjml: (node, { children }) => children(node).join("\n")
  }
}
