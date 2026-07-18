import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement these; components rely on them for virtualization
// and focus management. Provide inert stubs so tests can run.
afterEach(() => {
  cleanup();
});

if (!("scrollTo" in window)) {
  Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
