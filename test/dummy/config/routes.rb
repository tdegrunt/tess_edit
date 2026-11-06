Rails.application.routes.draw do
  mount TessEdit::Engine => "/tess_edit"
  root "demo#show"
  post "/", to: "demo#create", as: :demo
end
