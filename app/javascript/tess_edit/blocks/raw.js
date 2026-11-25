export default {
  type: "raw",
  name: "HTML",
  icon: "code",
  category: "content",
  roles: ["body", "content"],
  defaults: () => ({ data: { html: '<p style="margin:0;padding:10px 25px;">Custom HTML</p>' } }),
  fields: [{ title: "HTML", fields: [{ key: "data.html", label: "HTML", type: "code", liquid: true, hint: "Copied into the document as it is. Liquid works here too." }] }]
}
