import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAvecEffectif } from "../../api/types";

vi.mock("../../api/client", async () => {
  const reel = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...reel, apiFetch: vi.fn() };
});

import { apiFetch, ErreurApi } from "../../api/client";
import { FormulaireAgent } from "./FormulaireAgent";

const SERVICES: ServiceAvecEffectif[] = [{ id: "11111111-1111-1111-1111-111111111111", nom: "Urgences", code: "URG", actif: true, agentsPresents: 3 }];

function rendreFormulaire() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/", element: <FormulaireAgent mode="creation" /> }], { initialEntries: ["/"] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function remplirChampsObligatoires() {
  fireEvent.change(screen.getByLabelText(/^nom$/i), { target: { value: "Kaboré" } });
  fireEvent.change(screen.getByLabelText(/^prénom$/i), { target: { value: "Awa" } });
  fireEvent.change(screen.getByLabelText(/^genre$/i), { target: { value: "FEMININ" } });
  fireEvent.change(screen.getByLabelText(/^fonction$/i), { target: { value: "Infirmière" } });
  fireEvent.change(screen.getByLabelText(/^matricule$/i), { target: { value: "M-TEST-001" } });
  await waitFor(() => expect(screen.getByLabelText(/^service$/i).querySelectorAll("option")).toHaveLength(2));
  fireEvent.change(screen.getByLabelText(/^service$/i), { target: { value: SERVICES[0]!.id } });
  fireEvent.change(screen.getByLabelText(/type de contrat/i), { target: { value: "CDI" } });
  fireEvent.change(screen.getByLabelText(/date de recrutement/i), { target: { value: "2024-01-15" } });
}

describe("FormulaireAgent", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (chemin) => {
      if (typeof chemin === "string" && chemin.startsWith("/api/services")) return SERVICES;
      throw new Error(`apiFetch non mocké pour ${String(chemin)}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("le garde-fou de sortie (beforeunload) se déclenche seulement si le formulaire a été modifié", async () => {
    rendreFormulaire();
    await screen.findByLabelText(/^nom$/i);

    const eventPropre = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(eventPropre);
    expect(eventPropre.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText(/^nom$/i), { target: { value: "Kaboré" } });

    const eventModifie = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(eventModifie);
    expect(eventModifie.defaultPrevented).toBe(true);
  });

  it("une erreur 422 avec un champ ciblé s'affiche sous le bon champ, pas dans une alerte globale", async () => {
    vi.mocked(apiFetch).mockImplementation(async (chemin, options) => {
      if (typeof chemin === "string" && chemin.startsWith("/api/services")) return SERVICES;
      if (chemin === "/api/agents" && options?.method === "POST") {
        throw new ErreurApi("Ce matricule est déjà utilisé.", 422, undefined, "matricule");
      }
      throw new Error(`apiFetch non mocké pour ${String(chemin)}`);
    });

    rendreFormulaire();
    await screen.findByLabelText(/^nom$/i);
    await remplirChampsObligatoires();

    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    const erreurChamp = await screen.findByText("Ce matricule est déjà utilisé.");
    // L'erreur doit être rattachée au champ matricule, pas affichée comme une alerte globale.
    const champMatricule = screen.getByLabelText(/^matricule$/i);
    expect(champMatricule.parentElement).toContainElement(erreurChamp);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
