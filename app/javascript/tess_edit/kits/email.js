// The email kit: the document becomes MJML in the browser, which the server
// compiles to HTML with MRML (export/compile.js), for the canvas and the
// html output alike. Liquid stays in both, for rendering at send time.

import { toMjml } from "tess_edit/export/mjml"
import { compile } from "tess_edit/export/compile"
import { starterDocument } from "tess_edit/core/starter"

export default {
  key: "email",
  name: "Email",
  root: "email",
  starter: starterDocument,
  devices: [
    { key: "desktop", icon: "desktop", title: "Desktop" },
    { key: "mobile", icon: "mobile", title: "Mobile", width: "375px" }
  ],
  previewTitle: "Preview the email as sent, with Liquid tags",
  canvas: (doc, { editor, compileUrl, signal }) => compile(toMjml(doc, { editor }), { url: compileUrl, signal }),
  async outputs(doc, { compileUrl, signal }) {
    const mjml = toMjml(doc)
    const result = await compile(mjml, { url: compileUrl, signal })
    if (!result) return null
    return { outputs: { mjml, html: result.html || "" }, errors: result.errors }
  },
  notes: { mjml: "Liquid loops and conditions are in <mj-raw> tags.", html: "Liquid is left in place for rendering at send time." },
  errors: "The email could not be compiled"
}
