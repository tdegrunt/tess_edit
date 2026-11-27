// A color field's value as a color and its opacity, for its swatch and its
// Opacity slider: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() and transparent.
// Anything else (a color's name, Liquid) isn't read: null.
export function parseColor(value) {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "transparent") return { hex: "#ffffff", alpha: 0 }

  let match = text.match(/^#([0-9a-f]{3})$/)
  if (match) return { hex: `#${[...match[1]].map((digit) => digit + digit).join("")}`, alpha: 1 }

  match = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/)
  if (match) return { hex: `#${match[1]}`, alpha: match[2] ? round(parseInt(match[2], 16) / 255) : 1 }

  match = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)(%?)\s*)?\)$/)
  if (!match) return null
  const channels = match.slice(1, 4).map(Number)
  const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1)
  if (channels.some((channel) => channel > 255) || !(alpha >= 0 && alpha <= 1)) return null
  return { hex: `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`, alpha: round(alpha) }
}

// Its hex when it's opaque, else rgba(), which email clients take best
export function formatColor(hex, alpha) {
  if (alpha >= 1) return hex
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return `rgba(${red}, ${green}, ${blue}, ${round(alpha)})`
}

function round(alpha) {
  return Math.round(alpha * 100) / 100
}
