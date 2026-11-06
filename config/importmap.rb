# Pins for the tess_edit gem. The vendored bundles are built by script/vendor/build.mjs.

pin "tess_edit", to: "tess_edit/index.js"
pin_all_from TessEdit::Engine.root.join("app/javascript/tess_edit"), under: "tess_edit", to: "tess_edit"

pin "tess_edit/vendor/tiptap", to: "tess_edit/tiptap.js"
