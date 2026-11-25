require "test_helper"

# Named compilers, for kits whose output is made on the server (TessEdit.register_compiler)
class CompilersTest < ActiveSupport::TestCase
  setup do
    @compilers = TessEdit.compilers.dup
  end

  teardown do
    TessEdit.compilers = @compilers
  end

  test "a registered compiler makes HTML of its source, by its name as a symbol or a string" do
    TessEdit.register_compiler(:upcase) { |source| source.upcase }

    assert TessEdit.compiler?(:upcase)
    assert TessEdit.compiler?("upcase")
    assert_not TessEdit.compiler?(:fax)
    assert_equal TessEdit::Result.new(html: "<P>HI</P>", errors: []), TessEdit.compile("upcase", "<p>hi</p>")
    assert_equal "<P>HI</P>", TessEdit.compile(:upcase, "<p>hi</p>").html
  end

  test "the source has LF line endings, as a browser submits CRLF" do
    TessEdit.register_compiler(:echo) { |source| source }

    assert_equal "a\nb\nc\n", TessEdit.compile(:echo, "a\r\nb\rc\n").html
  end

  test "a compiler may give a Result with the reasons it couldn't compile, or raise one" do
    TessEdit.register_compiler(:picky) { |_source| TessEdit::Result.new(html: nil, errors: ["Not today"]) }
    TessEdit.register_compiler(:broken) { |_source| raise "Unclosed tag" }

    assert_equal TessEdit::Result.new(html: nil, errors: ["Not today"]), TessEdit.compile(:picky, "x")
    assert_equal TessEdit::Result.new(html: nil, errors: ["Unclosed tag"]), TessEdit.compile(:broken, "x")
  end

  test "a source that is not a string is compiled as one" do
    TessEdit.register_compiler(:echo) { |source| source }

    assert_equal "", TessEdit.compile(:echo, nil).html
  end

  test "an unknown compiler is an error, and a compiler needs a block" do
    assert_raises(TessEdit::UnknownCompiler) { TessEdit.compile(:fax, "x") }
    assert_raises(ArgumentError) { TessEdit.register_compiler(:empty) }
  end

  test "registering a name again replaces its compiler" do
    TessEdit.register_compiler(:greeting) { "Hi" }
    TessEdit.register_compiler("greeting") { "Hello" }

    assert_equal "Hello", TessEdit.compile(:greeting, "").html
  end
end
