// Where the documents using a layout put their own blocks. What a layout has
// inside it is example content to design the layout with; a document using
// the layout replaces it with its own. A layout has one.
//
// Outside the editor its contents are marked with two comments, so the host
// can put a document's content into the layout's output (see
// TessEdit::Content):
//
//   <!-- tess-edit:content --> … <!-- /tess-edit:content -->
//
// In MJML the comments are in <mj-raw> tags, which MJML keeps. A kit that
// uses it renders the same comments (see extendBlock in core/registry.js).

export const CONTENT_START = "<!-- tess-edit:content -->"
export const CONTENT_END = "<!-- /tess-edit:content -->"

const mjRaw = (comment) => `<mj-raw>${comment}</mj-raw>`

export default {
  type: "content",
  name: "Content",
  icon: "content",
  category: "layout",
  unique: true,
  // Like Loop and Condition it adds no HTML of its own and takes what its
  // parent takes, so it works at the top level and inside a column.
  roles: ["body", "content"],
  accepts: "inherit",
  hint: "The content of the documents using this layout goes here. What you put inside is example content for designing the layout.",
  render: {
    mjml(node, { editor, children }) {
      const inner = children(node)
      return editor ? inner.join("\n") : [mjRaw(CONTENT_START), ...inner, mjRaw(CONTENT_END)].join("\n")
    }
  }
}
