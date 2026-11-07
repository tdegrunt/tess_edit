Rails.application.routes.draw do
  mount TessEdit::Engine => "/tess_edit"
  root "demo#show"
  post "/", to: "demo#create", as: :demo
  get "media", to: "media#index", as: :media
  post "media", to: "media#create"
  get "variables", to: "variables#index", as: :variables
  get "media/:name", to: "media#show", as: :media_file, constraints: {name: %r{[^/]+}}
end
