// Field definitions shared by the built-in blocks, and usable by custom ones.
// A field: { key: "attributes.padding" | "data.subject", label, type, ... }.
// Types: text, textarea, code, size, color, select, font, segmented, toggle,
// spacing, list and slot (an element of the host's); see ui/inspector.js. A
// font field is a select of the host's fonts, the editor's options.fonts, or
// FONTS without them. A select's options can be a
// function of the editor, options(editor), for choices the host gives. A
// field's hint can be a function of its value, hint(value, node), shown as
// it's typed (a counter).
// `liquid` gives a field a button to insert the host's variables (see
// Inspector#variables).

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

// Fonts every browser and mail client has, with fallbacks
export const FONTS = [
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: "Trebuchet MS" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" }
]

// A font field's options: none (the placeholder, inherited), the host's
// fonts or FONTS, and a value that is neither, as it is
export function fontOptions(fonts, value, placeholder = "Default") {
  const options = (fonts?.length ? fonts : FONTS).map((font) => (typeof font === "string" ? { value: font, label: font.split(",")[0].replace(/['"]/g, "").trim() } : font))
  const other = value && !options.some((option) => option.value === value) ? [{ value, label: value }] : []
  return [{ value: "", label: placeholder }, ...options, ...other]
}

export const padding = { key: "attributes.padding", label: "Padding", type: "spacing" }
export const align = { key: "attributes.align", label: "Align", type: "segmented", options: ALIGN }
export const background = { key: "attributes.background-color", label: "Background", type: "color" }

export const typography = (extra = []) => ({
  title: "Typography",
  fields: [
    { key: "attributes.font-family", label: "Font family", type: "font", placeholder: "Inherit" },
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
