require "application_system_test_case"

class ValuesTest < ApplicationSystemTestCase
  setup do
    visit "/?values=1"
  end

  test "the canvas shows an expression's value, with its Liquid when pointed at, and the Liquid of one without" do
    within_canvas do
      assert_selector ".tess-v.tess-v-filled[title='{{ customer.first_name }}']", text: "Ada", exact_text: true
      assert_selector ".tess-v.tess-v-filled", text: "1042", exact_text: true
      assert_no_selector ".tess-v-filled", text: "{{ order.url }}"
    end
  end

  test "text being edited shows the value until the caret goes into its Liquid" do
    within_canvas do
      canvas_block("Thanks for your order, Ada").double_click
      assert_selector ".ProseMirror .tess-v-filled", text: "Ada", exact_text: true
      assert_no_text "{{ customer.first_name }}"
      find(".ProseMirror .tess-v-filled", text: "Ada").click
      assert_selector ".ProseMirror .tess-v-raw", text: "{{ customer.first_name }}"
      find(".ProseMirror").send_keys(:escape)
      assert_selector ".tess-v-filled[data-tess-call]", text: "Ada"
    end
  end

  test "values the host sets later show at once, and without one the Liquid comes back" do
    page.execute_script("document.querySelector('[data-controller=tess-edit]').tessEdit.setValues({'customer.first_name': 'Grace'})")
    within_canvas do
      assert_selector ".tess-v-filled", text: "Grace", exact_text: true
      assert_selector ".tess-v:not(.tess-v-filled)", text: "{{ order.number }}"
    end
    page.execute_script("document.querySelector('[data-controller=tess-edit]').tessEdit.setValues({})")
    within_canvas { assert_selector ".tess-v:not(.tess-v-filled)", text: "{{ customer.first_name }}" }
  end
end
