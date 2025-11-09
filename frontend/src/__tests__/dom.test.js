// frontend/src/__tests__/dom.test.js
import "@testing-library/jest-dom";

const { screen } = require('@testing-library/dom');
require('@testing-library/jest-dom');

test('renders a reservation button', () => {
  document.body.innerHTML = '<button>Reserve Table</button>';
  expect(screen.getByText('Reserve Table')).toBeInTheDocument();
});
