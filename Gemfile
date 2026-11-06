source "https://rubygems.org"

# Specify your gem's dependencies in tess_edit.gemspec.
gemspec

gem "puma"
gem "propshaft"
gem "tailwindcss-rails", "~> 4.0"

group :development, :test do
  gem "standard", require: false
  gem "capybara"
  gem "selenium-webdriver"
  # Renders the compiled sample in test/liquid_render_test.rb, as a host app would at send time
  gem "liquid"
end
