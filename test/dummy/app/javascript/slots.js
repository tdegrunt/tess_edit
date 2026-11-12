// A slot the demo adds to the email's root the way a host app adds its own
// form fields to Inspect: the element is the page's (demo/show.html.erb, at
// /?slots=1), its values submit with the form. Without it the group doesn't show.

import { extendBlock } from "tess_edit"

extendBlock("email", {
  fields: [
    {
      title: "Sender",
      before: "Message",
      fields: [
        {
          key: "sender",
          label: "From",
          type: "slot",
          slot: "sender",
          summary: (element) => [element.querySelector("select").selectedOptions[0]?.text, element.querySelector("input").value].filter(Boolean).join(" · "),
          open: (element) => !element.querySelector("input").value
        }
      ]
    }
  ]
})
