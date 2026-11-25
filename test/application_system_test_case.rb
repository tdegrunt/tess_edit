require "test_helper"
require "socket"

# Runs Chrome through a Selenium server when SELENIUM_URL is set (as in a
# devcontainer, e.g. http://selenium:4444/), otherwise a local headless Chrome.
# HEADLESS=0 shows the browser.
class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  HEADLESS = !ENV.fetch("HEADLESS", "1").in?(%w[n 0 no false])
  SCREEN_SIZE = [1440, 900]

  if ENV["SELENIUM_URL"].present?
    driven_by :selenium, using: (HEADLESS ? :headless_chrome : :chrome), screen_size: SCREEN_SIZE,
      options: {browser: :remote, url: ENV["SELENIUM_URL"]}

    # The browser runs in another container, so serve the app on all interfaces
    # and point it at this container's address.
    Capybara.server_host = "0.0.0.0"
    Capybara.server_port = 3100
    Capybara.app_host = ENV["CAPYBARA_APP_HOST"].presence ||
      "http://#{Socket.ip_address_list.find(&:ipv4_private?)&.ip_address || Socket.gethostname}:#{Capybara.server_port}"
  else
    driven_by :selenium, using: (HEADLESS ? :headless_chrome : :chrome), screen_size: SCREEN_SIZE
  end

  # Chrome 158 refuses Capybara 3.40's reset between tests, which clears the
  # storage of every origin ("*" is not a valid URL), so this clears the
  # app's: its cookies and localStorage (a remembered panel layout)
  module ClearAppStorage
    def execute_cdp(cmd, params = {})
      return super unless cmd == "Storage.clearDataForOrigin" && params[:origin] == "*"

      super(cmd, params.merge(origin: Capybara.app_host.presence || Capybara.current_session.server.base_url))
    end
  end
  Capybara::Selenium::Driver::ChromeDriver.prepend(ClearAppStorage)

  Capybara.default_max_wait_time = 5
  Capybara.server = :puma, {Silent: true}

  private

  # The browser's: a Mac's own Chrome, or Linux's through Selenium
  # Selects all the text being edited (inside within_canvas): a select-all
  # key doesn't reach the text through every browser's driver (Chrome 157's
  # ignores ⌘A), a selection in the page does, as ProseMirror follows it
  def select_all_text
    # Once the text has its caret, which would replace the selection
    eventually { assert page.evaluate_script("document.activeElement?.classList.contains('ProseMirror') || false") }
    execute_script(<<~JS)
      const text = document.querySelector(".ProseMirror")
      const range = document.createRange()
      range.selectNodeContents(text)
      text.focus()
      document.getSelection().removeAllRanges()
      document.getSelection().addRange(range)
    JS
  end

  # The canvas of the demo's Note editor, or of the kit with the given name
  def within_canvas(kit = "Note", &)
    within_frame(find("iframe[title='#{kit} canvas']"), &)
  end

  # A block on the canvas (inside within_canvas) with this text, one with no
  # blocks inside it: a Text, not the Section and Column it is in. (Blocks
  # have a tess-<id> class, and ids start with a b; the selection's outline
  # is a tess-box.)
  BLOCK = "[class^='tess-b']:not(.tess-box):not(:has([class^='tess-b']))"

  def canvas_block(text, **options)
    find(BLOCK, text: text, **options)
  end

  # Retries the block until its assertions pass, for the editor's debounced outputs.
  def eventually(timeout: Capybara.default_max_wait_time)
    deadline = Time.now + timeout
    begin
      yield
    rescue Minitest::Assertion
      raise if Time.now > deadline
      sleep 0.1
      retry
    end
  end

  def output(name)
    find("##{name}", visible: false).value
  end

  def document_json
    JSON.parse(output("json"))
  end

  # Depth-first list of [type, label] for every block, labels being a
  # button's label or the plain text of a text block.
  def blocks(node = document_json)
    label = node.dig("data", "content")
    label = plain_text(label) if label.is_a?(Hash)
    [[node["type"], label]] + node["children"].flat_map { |child| blocks(child) }
  end

  def plain_text(content)
    return content["text"].to_s if content["type"] == "text"
    Array(content["content"]).map { |child| plain_text(child) }.join(" ")
  end

  # The field with the given label in the Inspect panel.
  def setting(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..").find("input, textarea, select")
  end
end
