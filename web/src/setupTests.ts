import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals: false` dans vitest.config.ts : le nettoyage automatique de
// Testing Library ne s'enregistre pas tout seul, il faut l'appeler ici.
afterEach(() => {
  cleanup();
});
