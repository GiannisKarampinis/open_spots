import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/dom";
import FormSelect from "../../src/components/FormSelect";

test("language selector is labeled, supports keyboard selection, and closes outside", async () => {
  global.React = React;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root"));
  const onChange = jest.fn();
  try {
    await act(async () => root.render(<FormSelect id="language-select" name="language" ariaLabel="Language" value="en" onChange={onChange} options={[{ value: "en", label: "EN" }, { value: "el", label: "GR" }]} />));
    const trigger = screen.getByRole("combobox", { name: "Language" });
    await act(async () => fireEvent.keyDown(trigger, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(trigger, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }));
    expect(onChange).toHaveBeenCalledWith({ target: { name: "language", value: "el" } });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
    await act(async () => fireEvent.click(trigger));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await act(async () => fireEvent.pointerDown(document.body));
    expect(screen.queryByRole("listbox")).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
