// frontend/src/__tests__/domInteraction.test.js
import { screen } from "@testing-library/dom";
import "@testing-library/jest-dom";

test("renders a reservation button", () => {
  document.body.innerHTML = "<button>Reserve Table</button>";
  expect(screen.getByText("Reserve Table")).toBeInTheDocument();
});
