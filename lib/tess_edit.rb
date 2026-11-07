require "importmap-rails"
require "stimulus-rails"
require "mrml"
require "tess_edit/version"
require "tess_edit/engine"

module TessEdit
  Result = Data.define(:html, :errors)

  # The controller the engine's controllers inherit from, as a string. Set it
  # to a controller of the host app, such as "Admin::BaseController", so the
  # compile endpoint is behind the same sign-in and authorization:
  #
  #   # config/initializers/tess_edit.rb
  #   TessEdit.parent_controller = "Admin::BaseController"
  mattr_accessor :parent_controller, default: "ActionController::Base"

  # Compiles MJML to HTML with MRML. Liquid passes through untouched. When the
  # MJML can't be parsed, html is nil and errors holds the reason.
  #
  # Browsers submit form fields with CRLF line endings, which MRML can't parse
  # in mj-head, so line endings become LF first.
  def self.compile(mjml)
    Result.new(html: MRML::Template.new(mjml.to_s.gsub(/\r\n?/, "\n")).to_html, errors: [])
  rescue MRML::Error => error
    Result.new(html: nil, errors: [error.message])
  end
end
