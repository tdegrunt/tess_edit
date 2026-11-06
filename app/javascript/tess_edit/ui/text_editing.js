// Inline rich-text editing with Tiptap, mounted inside the canvas iframe on the
// text block's own element, plus the formatting toolbar above the canvas.

import { Color, Editor, StarterKit, TextAlign, TextStyle } from "tess_edit/vendor/tiptap"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const BUTTON = "w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
const ACTIVE = "bg-blue-50 text-blue-700"

export class TextEditing {
  constructor(toolbar) {
    this.toolbar = toolbar
    this.tiptap = null
  }

  get active() {
    return !!this.tiptap
  }

  start(container, content, onUpdate) {
    this.stop()
    container.replaceChildren()
    this.tiptap = new Editor({
      element: container,
      content: content || { type: "doc", content: [{ type: "paragraph" }] },
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          heading: { levels: [1, 2, 3] },
          // Liquid in links ({{ url }}) is fine: do not filter URLs.
          link: { openOnClick: false, autolink: false, linkOnPaste: true, isAllowedUri: () => true }
        }),
        TextStyle,
        Color,
        TextAlign.configure({ types: ["heading", "paragraph"] })
      ],
      autofocus: "end",
      onUpdate: ({ editor }) => onUpdate(editor.getJSON()),
      onTransaction: () => this.renderToolbar()
    })
    this.renderToolbar()
    return this.tiptap
  }

  stop() {
    if (!this.tiptap) return null
    const json = this.tiptap.getJSON()
    this.tiptap.destroy()
    this.tiptap = null
    this.toolbar.replaceChildren()
    this.toolbar.classList.add("hidden")
    return json
  }

  renderToolbar() {
    const editor = this.tiptap
    if (!editor) return
    const chain = () => editor.chain().focus()
    const button = (name, title, active, run) =>
      h("button", {
        type: "button",
        title,
        class: `${BUTTON} ${active ? ACTIVE : ""}`,
        html: icon(name),
        onmousedown: (event) => event.preventDefault(),
        onclick: run
      })
    const separator = () => h("span", { class: "mx-1 h-5 w-px bg-gray-200" })

    const level = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }))
    const style = h(
      "select",
      {
        class: "h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs text-gray-800",
        title: "Paragraph style",
        onchange: (event) => {
          const value = Number(event.target.value)
          value ? chain().setHeading({ level: value }).run() : chain().setParagraph().run()
        }
      },
      h("option", { value: "0", selected: !level }, "Paragraph"),
      [1, 2, 3].map((l) => h("option", { value: String(l), selected: level === l }, `Heading ${l}`))
    )

    const currentColor = editor.getAttributes("textStyle").color
    const color = h("input", {
      type: "color",
      title: "Text color",
      class: "h-7 w-8 cursor-pointer rounded border border-gray-300 bg-white p-0.5",
      value: /^#[0-9a-f]{6}$/i.test(currentColor || "") ? currentColor : "#000000",
      onchange: (event) => chain().setColor(event.target.value).run()
    })

    this.toolbar.replaceChildren(...[
      style,
      separator(),
      button("bold", "Bold (⌘B)", editor.isActive("bold"), () => chain().toggleBold().run()),
      button("italic", "Italic (⌘I)", editor.isActive("italic"), () => chain().toggleItalic().run()),
      button("underline", "Underline (⌘U)", editor.isActive("underline"), () => chain().toggleUnderline().run()),
      button("strike", "Strikethrough", editor.isActive("strike"), () => chain().toggleStrike().run()),
      color,
      separator(),
      button("link", "Link", editor.isActive("link"), () => {
        const previous = editor.getAttributes("link").href || "https://"
        const href = window.prompt("Link URL (Liquid allowed, e.g. {{ order.url }})", previous)
        if (href === null) return
        href ? chain().extendMarkRange("link").setLink({ href }).run() : chain().extendMarkRange("link").unsetLink().run()
      }),
      editor.isActive("link") ? button("unlink", "Remove link", false, () => chain().extendMarkRange("link").unsetLink().run()) : null,
      separator(),
      button("align-left", "Align left", editor.isActive({ textAlign: "left" }), () => chain().setTextAlign("left").run()),
      button("align-center", "Align center", editor.isActive({ textAlign: "center" }), () => chain().setTextAlign("center").run()),
      button("align-right", "Align right", editor.isActive({ textAlign: "right" }), () => chain().setTextAlign("right").run()),
      separator(),
      button("list-bullet", "Bulleted list", editor.isActive("bulletList"), () => chain().toggleBulletList().run()),
      button("list-ordered", "Numbered list", editor.isActive("orderedList"), () => chain().toggleOrderedList().run()),
      separator(),
      button("clear", "Clear formatting", false, () => chain().unsetAllMarks().clearNodes().run())
    ].filter(Boolean))
    this.toolbar.classList.remove("hidden")
  }
}
