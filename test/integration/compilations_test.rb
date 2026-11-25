require "test_helper"

# The engine's compile endpoint, POST /tess_edit/compile with {compiler, source},
# for a kit that compiles on the server with a compiler the host registered
class CompilationsTest < ActionDispatch::IntegrationTest
  setup do
    @compilers = TessEdit.compilers.dup
    TessEdit.register_compiler(:upcase) { |source| source.upcase }
    TessEdit.register_compiler(:picky) { |source| TessEdit::Result.new(html: nil, errors: ["#{source} won't do"]) }
    TessEdit.register_compiler(:broken) { |_source| raise ArgumentError, "Unclosed tag" }
  end

  teardown do
    TessEdit.compilers = @compilers
  end

  test "compiles the source with the named compiler" do
    post tess_edit.compile_path, params: {compiler: "upcase", source: "<p>Hi {{ name }}</p>"}, as: :json

    assert_response :success
    assert_equal "<P>HI {{ NAME }}</P>", response.parsed_body["html"]
    assert_empty response.parsed_body["errors"]
  end

  test "reports a source that can't be compiled, with the compiler's reasons" do
    post tess_edit.compile_path, params: {compiler: "picky", source: "This"}, as: :json

    assert_response :unprocessable_content
    assert_nil response.parsed_body["html"]
    assert_equal ["This won't do"], response.parsed_body["errors"]
  end

  test "an error the compiler raises is the reason" do
    post tess_edit.compile_path, params: {compiler: "broken", source: "<div>"}, as: :json

    assert_response :unprocessable_content
    assert_nil response.parsed_body["html"]
    assert_equal ["Unclosed tag"], response.parsed_body["errors"]
  end

  test "an unknown or missing compiler is not found" do
    post tess_edit.compile_path, params: {compiler: "fax", source: "x"}, as: :json
    assert_response :not_found
    assert_nil response.parsed_body["html"]
    assert_equal ["No compiler fax"], response.parsed_body["errors"]

    post tess_edit.compile_path, params: {source: "x"}, as: :json
    assert_response :not_found
  end

  test "requires the CSRF token" do
    ActionController::Base.allow_forgery_protection = true
    post tess_edit.compile_path, params: {compiler: "upcase", source: "x"}, as: :json
    assert_response :unprocessable_content
    assert_nil response.parsed_body["html"] if response.media_type == "application/json"
  ensure
    ActionController::Base.allow_forgery_protection = false
  end
end
