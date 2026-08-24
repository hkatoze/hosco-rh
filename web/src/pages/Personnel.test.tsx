import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageAgents } from "../api/types";

vi.mock("../api/client", async () => {
  const reel = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...reel, apiFetch: vi.fn() };
});

import { apiFetch } from "../api/client";
import { Personnel } from "./Personnel";

const pageVide: PageAgents = { donnees: [], page: 1, taille: 25, total: 0 };

/** Rend visible l'URL courante dans le DOM, pour l'observer facilement.
 * (MemoryRouter ne touche jamais window.location — il faut useLocation().) */
function TemoinUrl() {
  const location = useLocation();
  return <span data-testid="url-temoin">{location.pathname + location.search}</span>;
}

/** Bouton test-only qui navigue via useNavigate(), pour simuler une
 * navigation externe (ex: retour arrière) sans passer par router.navigate()
 * d'un data router — createMemoryRouter/RouterProvider plantent sous jsdom
 * (AbortSignal non reconnu par undici lors de la construction du Request
 * interne aux loaders). MemoryRouter classique n'a pas ce problème. */
function NavigationExterne({ vers }: { vers: string }) {
  const naviguer = useNavigate();
  return (
    <button type="button" onClick={() => naviguer(vers)}>
      simuler navigation externe
    </button>
  );
}

function rendrePersonnel(entreeInitiale: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entreeInitiale]}>
        <Routes>
          <Route
            path="/personnel"
            element={
              <>
                <Personnel />
                <TemoinUrl />
                <NavigationExterne vers="/personnel?q=Zongo" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Personnel — synchronisation filtres/URL (deux sens)", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (chemin) => {
      if (typeof chemin === "string" && chemin.startsWith("/api/services")) return [];
      return pageVide;
    });
  });

  // Garantie même si un test échoue : sinon des minuteurs factices actifs
  // font capoter (timeout) tous les tests suivants qui utilisent waitFor.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("URL -> champ : un paramètre q initial pré-remplit la recherche", async () => {
    rendrePersonnel("/personnel?q=Kabore");
    const champ = await screen.findByLabelText(/recherche par nom ou matricule/i);
    expect(champ).toHaveValue("Kabore");
  });

  it("champ -> URL : taper une recherche met à jour l'URL après le délai de 300 ms", async () => {
    vi.useFakeTimers();
    rendrePersonnel("/personnel");

    const champ = screen.getByLabelText(/recherche par nom ou matricule/i);
    // fireEvent (plutôt que userEvent) : synchrone, ne dépend pas des
    // délais internes de userEvent qui n'interagissent pas bien avec des
    // minuteurs factices (deadlock constaté avec userEvent.type ici).
    act(() => {
      fireEvent.change(champ, { target: { value: "Traore" } });
    });

    // Avant le délai, l'URL ne doit pas encore avoir bougé.
    expect(screen.getByTestId("url-temoin")).not.toHaveTextContent("q=Traore");

    // Sous minuteurs factices, waitFor (qui repose sur de vrais timers pour
    // sonder) ne convient pas : on avance le temps puis on laisse React
    // effectuer la mise à jour d'état dans un act() synchrone.
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId("url-temoin")).toHaveTextContent("q=Traore");
  });

  it("URL -> champ : une navigation externe (retour arrière) resynchronise le champ", async () => {
    rendrePersonnel("/personnel?q=Kabore");
    await screen.findByDisplayValue("Kabore");

    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole("button", { name: /simuler navigation externe/i }));

    await waitFor(() => expect(screen.getByLabelText(/recherche par nom ou matricule/i)).toHaveValue("Zongo"));
  });

  it("changer un filtre (statut) met à jour l'URL et remet la page à 1", async () => {
    rendrePersonnel("/personnel?statut=EN_CONGE&page=3");
    const selecteur = await screen.findByLabelText(/^statut$/i);
    expect(selecteur).toHaveValue("EN_CONGE");

    const utilisateur = userEvent.setup();
    await utilisateur.selectOptions(selecteur, "SUSPENDU");

    await waitFor(() => {
      const params = new URLSearchParams(screen.getByTestId("url-temoin").textContent?.split("?")[1] ?? "");
      expect(params.get("statut")).toBe("SUSPENDU");
      expect(params.get("page")).toBe("1");
    });
  });
});
