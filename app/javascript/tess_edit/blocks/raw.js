export default {
  type: "raw",
  name: "HTML",
  icon: "code",
  category: "content",
  roles: ["body", "content"],
  defaults: () => ({ data: { html: '<p style="margin:0;padding:10px 25px;">Custom HTML</p>' } }),
  fields: [{ title: "HTML", fields: [{ key: "data.html", label: "HTML", type: "code", hint: "Copied into the email as-is. Liquid works here too." }] }],
  render: {
    mjml(node, { editor, context }) {
      const html = node.data.html || ""
      if (!editor) return `<mj-raw>${html}</mj-raw>`
      // mj-raw output cannot carry a class, so the canvas shows it inside a text block.
      const text = `<mj-text css-class="tess-${node.id}" padding="0px">${html}</mj-text>`
      return context === "column" ? text : `<mj-section padding="0px"><mj-column>${text}</mj-column></mj-section>`
    }
  }
}
