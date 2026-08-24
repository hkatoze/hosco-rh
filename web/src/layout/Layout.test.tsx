import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UtilisateurConnecte } from "../api/types";

vi.mock("../hooks/useSession", () => ({ useSession: vi.fn() }));
vi.mock("../api/client", async () => {
  const reel = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...reel, apiFetch: vi.fn().mockResolvedValue([]) };
});

import { useSession } from "../hooks/useSession";
import { Layout } from "./Layout";

function utilisateur(role: UtilisateurConnecte["role"]): UtilisateurConnecte {
  return { id: "1", identifiant: "test", nom: "Agent Test", role, actif: true, doitChangerMotDePasse: false };
}

function rendreLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/", element: <Layout />, children: [{ index: true, element: <div>contenu</div> }] }],
    { initialEntries: ["/"] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("Layout — navigation", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReset();
  });

  it("affiche le lien « Paramètres » quel que soit le rôle (LECTURE)", () => {
    // @ts-expect-error -- seuls `data` importe pour ce composant
    vi.mocked(useSession).mockReturnValue({ data: utilisateur("LECTURE"), isLoading: false, isError: false });
    rendreLayout();
    expect(screen.getByText("Personnel")).toBeInTheDocument();
    expect(screen.getByText("Paramètres")).toBeInTheDocument();
  });

  it("affiche le lien « Paramètres » pour un rôle ADMIN", () => {
    // @ts-expect-error -- seuls `data` importe pour ce composant
    vi.mocked(useSession).mockReturnValue({ data: utilisateur("ADMIN"), isLoading: false, isError: false });
    rendreLayout();
    expect(screen.getByText("Paramètres")).toBeInTheDocument();
  });
});
