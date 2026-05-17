/**
 * Vitest global setup — runs before every test file.
 * Import Testing Library jest-dom matchers so all test files get them automatically.
 */
import "@testing-library/jest-dom";

// Remix Vite plugin checks for this global before transforming JSX in component tests.
// Without it, any test that imports a .tsx component with React hooks throws
// "Remix Vite plugin can't detect preamble".
// Setting it in jsdom's window satisfies the check.
(window as Window & { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
