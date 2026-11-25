require "importmap-rails"
require "stimulus-rails"
require "tess_edit/version"
require "tess_edit/engine"
require "tess_edit/content"

module TessEdit
  Result = Data.define(:html, :errors)

  class UnknownCompiler < StandardError; end

  # The controller the engine's controllers inherit from, as a string. Set it
  # to a controller of the host app, such as "Admin::BaseController", so the
  # compile endpoint is behind the same sign-in and authorization:
  #
  #   # config/initializers/tess_edit.rb
  #   TessEdit.parent_controller = "Admin::BaseController"
  mattr_accessor :parent_controller, default: "ActionController::Base"

  mattr_accessor :compilers, default: {}

  # A compiler for a kit whose output is made on the server, such as an
  # email's MJML that becomes HTML. The block takes the source and returns
  # the HTML, or a TessEdit::Result with the reasons it couldn't; an error
  # it raises is one of those reasons too:
  #
  #   TessEdit.register_compiler(:mjml) { |mjml| MRML::Template.new(mjml).to_html }
  #
  # The kit compiles through the engine's endpoint, POST /tess_edit/compile
  # with {compiler: "mjml", source: "…"} (compile in
  # app/javascript/tess_edit/export/compile.js), and the host
  # with TessEdit.compile(:mjml, source), so both make the same HTML.
  def self.register_compiler(name, &compiler)
    raise ArgumentError, "A compiler needs a block" unless compiler

    compilers[name.to_s] = compiler
  end

  def self.compiler?(name)
    compilers.key?(name.to_s)
  end

  # The source compiled by the named compiler: html, nil when it couldn't
  # be compiled, and errors, the reasons. Browsers submit form fields with
  # CRLF line endings, so line endings become LF first.
  def self.compile(name, source)
    compiler = compilers.fetch(name.to_s) { raise UnknownCompiler, "No compiler #{name}, see TessEdit.register_compiler" }
    result = compiler.call(source.to_s.gsub(/\r\n?/, "\n"))
    result.is_a?(Result) ? result : Result.new(html: result.to_s, errors: [])
  rescue UnknownCompiler
    raise
  rescue => error
    Result.new(html: nil, errors: [error.message])
  end
end
