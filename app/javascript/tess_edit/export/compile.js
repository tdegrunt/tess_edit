// MJML → HTML with mjml-browser. MJML 5 compiles asynchronously.

import mjml2html from "tess_edit/vendor/mjml-browser"

export async function compile(mjml, options = {}) {
  const result = await mjml2html(mjml, { validationLevel: "soft", keepComments: false, ...options })
  return { html: result.html, errors: result.errors || [] }
}
