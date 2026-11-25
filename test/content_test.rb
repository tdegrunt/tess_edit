require "test_helper"

# A document's content in its layout's output, as the Content block marks it
class ContentTest < ActiveSupport::TestCase
  test "an HTML layout takes the document's HTML between the markers" do
    layout = "<html><body><header>Logo</header>\n<!-- tess-edit:content -->\n<p>Example</p>\n<!-- /tess-edit:content -->\n</body></html>"
    merged = TessEdit::Content.merge(layout, "\n<p>Own</p>\n")
    assert_equal "\n<p>Own</p>\n", TessEdit::Content.content_of(merged)
    assert_equal "<html><body><header>Logo</header>\n<!-- tess-edit:content -->\n<p>Own</p>\n<!-- /tess-edit:content -->\n</body></html>", merged
  end

  test "the markers may each be in a tag of their own, as MJML's mj-raw" do
    layout = "<mj-section><mj-text>Logo</mj-text></mj-section><mj-raw><!-- tess-edit:content --></mj-raw><mj-text>Example</mj-text><mj-raw><!-- /tess-edit:content --></mj-raw>"
    merged = TessEdit::Content.merge(layout, "<mj-text>Own</mj-text>")
    assert_equal "<mj-section><mj-text>Logo</mj-text></mj-section><mj-raw><!-- tess-edit:content --></mj-raw><mj-text>Own</mj-text><mj-raw><!-- /tess-edit:content --></mj-raw>", merged
    assert_equal "<mj-text>Own</mj-text>", TessEdit::Content.content_of(merged)
    assert_equal "<p>Example</p>", TessEdit::Content.content_of("<div><!-- tess-edit:content --></div><p>Example</p><div><!-- /tess-edit:content --></div>")
  end

  test "bare markers and wrapped ones can be mixed" do
    assert_equal "<p>Mixed</p>", TessEdit::Content.content_of("<mj-raw><!-- tess-edit:content --></mj-raw><p>Mixed</p><!-- /tess-edit:content -->")
  end

  test "an output needs exactly one Content block" do
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.content_of("<p>none</p>") }
    twice = "<!-- tess-edit:content -->a<!-- /tess-edit:content --><!-- tess-edit:content -->b<!-- /tess-edit:content -->"
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.merge(twice, "c") }
  end

  test "a document's own nodes go in and come out of the layout's document" do
    layout = {"type" => "note", "children" => [{"type" => "section", "children" => [{"type" => "content", "children" => [{"type" => "text"}]}]}]}
    own = [{"id" => "b1", "type" => "text", "data" => {"x" => 1}}]
    document = TessEdit::Content.document_with(layout, own)
    assert_equal own, TessEdit::Content.nodes(document)
    assert_equal [{"type" => "text"}], TessEdit::Content.nodes(layout), "the layout stays as it is"
    assert_nil TessEdit::Content.nodes({"type" => "note", "children" => []})
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.document_with({"type" => "note"}, own) }
  end
end
