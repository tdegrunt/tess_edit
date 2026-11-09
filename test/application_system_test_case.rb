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

  Capybara.default_max_wait_time = 5
  Capybara.server = :puma, {Silent: true}

  private

  # The browser's: a Mac's own Chrome, or Linux's through Selenium
  def select_all_key
    (RUBY_PLATFORM.include?("darwin") && ENV["SELENIUM_URL"].blank?) ? :command : :control
  end

  # The canvas of the email editor, or of the kit with the given name
  def within_canvas(kit = "Email", &)
    within_frame(find("iframe[title='#{kit} canvas']"), &)
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

  # Depth-first list of [type, label] for every block, labels being button
  # text or the plain text of a text block.
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
