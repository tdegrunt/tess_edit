Rails.application.routes.draw do
  root "demo#show"
  post "/", to: "demo#create", as: :demo
end
