TessEdit::Engine.routes.draw do
  post "compile", to: "compilations#create", as: :compile
end
