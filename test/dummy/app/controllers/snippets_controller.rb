# The demo's snippets: reusable blocks from the server, which the demo's
# palette source (app/javascript/snippets.js) lists in the Blocks panel and
# inserts as a copy. An email gets a greeting and a footer section, a note
# (the demo's kit) only the greeting.
class SnippetsController < ApplicationController
  def self.text(id, text)
    {id: id, type: "text", attributes: {padding: "4px 25px"}, data: {content: {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: text}]}]}}, children: []}
  end

  GREETING = {key: "greeting", label: "Greeting", description: "A friendly opening line", block: text("bgreet1", "Dear {{ customer.name }},")}.freeze

  FOOTER = {
    key: "footer",
    label: "Footer",
    description: "The shop's address, in a section of its own",
    block: {id: "bfoot1", type: "section", attributes: {padding: "16px 0px"}, data: {}, children: [{id: "bfoot2", type: "column", attributes: {}, data: {}, children: [text("bfoot3", "ACME Store · Main Street 1 · Amsterdam")]}]}
  }.freeze

  SNIPPETS = {"email" => [GREETING, FOOTER], "note" => [GREETING]}.freeze

  def index
    render json: {snippets: SNIPPETS.fetch(params[:kit].presence || "email", [])}
  end
end
