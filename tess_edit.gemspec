require_relative "lib/tess_edit/version"

Gem::Specification.new do |spec|
  spec.name = "tess_edit"
  spec.version = TessEdit::VERSION
  spec.authors = ["Tom de Grunt"]
  spec.email = ["tom@degrunt.nl"]
  spec.homepage = "https://github.com/tdegrunt/tess_edit"
  spec.summary = "Drag-and-drop MJML email editor for Rails, built with Stimulus"
  spec.description = "A drag-and-drop block editor that stores a JSON tree and exports MJML and HTML, with Liquid support. Vanilla JavaScript and Stimulus, served through importmap."
  spec.license = "MIT"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,lib,vendor}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 7.1"
  spec.add_dependency "importmap-rails", ">= 2"
  spec.add_dependency "stimulus-rails"
end
