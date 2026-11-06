// Field definitions shared by the built-in blocks, and usable by custom ones.
// A field: { key: "attributes.padding" | "data.subject", label, type, ... }.
// Types: text, textarea, code, size, color, select, segmented, toggle,
// spacing and list; see ui/inspector.js.

export const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
]

export const VERTICAL_ALIGN = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" }
]

export const padding = { key: "attributes.padding", label: "Padding", type: "spacing" }
export const align = { key: "attributes.align", label: "Align", type: "segmented", options: ALIGN }
export const background = { key: "attributes.background-color", label: "Background", type: "color" }

export const typography = (extra = []) => ({
  title: "Typography",
  fields: [
    { key: "attributes.font-family", label: "Font family", type: "text", placeholder: "Inherit" },
    { key: "attributes.font-size", label: "Font size", type: "size", placeholder: "13px" },
    { key: "attributes.line-height", label: "Line height", type: "text", placeholder: "1" },
    { key: "attributes.letter-spacing", label: "Letter spacing", type: "size" },
    { key: "attributes.font-weight", label: "Font weight", type: "select", options: ["", "300", "400", "500", "600", "700", "800"] },
    { key: "attributes.color", label: "Text color", type: "color" },
    ...extra
  ]
})

export const border = {
  title: "Border",
  collapsed: true,
  fields: [
    { key: "attributes.border", label: "Border", type: "text", placeholder: "1px solid #e5e7eb" },
    { key: "attributes.border-radius", label: "Radius", type: "size" }
  ]
}
