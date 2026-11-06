# Configure Rails Environment
ENV["RAILS_ENV"] = "test"

require_relative "../test/dummy/config/environment"
require "rails/test_help"

ActiveSupport::TestCase.file_fixture_path = File.expand_path("fixtures/files", __dir__)
