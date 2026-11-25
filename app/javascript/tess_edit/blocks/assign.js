// {% assign variable = expression %}: a Liquid variable for the blocks after
// it, such as a collection filtered before a Loop goes over it (Liquid's for
// and if take no filters):
//
//   {% assign lines = contract.lines | where: "party", "account" %}
//
// It shows nothing; in the editor, Layers shows it. In a table it goes
// between rows.

export const assignTag = (node) => `{% assign ${node.data.variable || "value"} = ${node.data.expression || "nil"} %}`

export default {
  type: "assign",
  name: "Assign",
  icon: '<path d="M5 9h6M5 15h6"/><path d="M14 7l5 5-5 5"/>',
  category: "liquid",
  roles: ["body", "content", "row"],
  defaults: () => ({ data: { variable: "items", expression: "" } }),
  fields: [
    {
      title: "Assign",
      fields: [
        { key: "data.variable", label: "Variable", type: "text", hint: "The name the blocks after it use, e.g. lines." },
        { key: "data.expression", label: "Value", type: "text", liquid: "expression", hint: "A Liquid expression, with filters, e.g. order.lines | where: \"kind\", \"product\"." }
      ]
    }
  ],
  hint: "Sets a Liquid variable for the blocks after it: {% assign variable = value %}.",
  label: (node) => `${node.data.variable || "…"} = ${node.data.expression || "…"}`
}
