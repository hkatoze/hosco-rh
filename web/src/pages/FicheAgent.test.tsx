import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDetail, UtilisateurConnecte } from "../api/types";

vi.mock("../api/client", async () => {
  const reel = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...reel, apiFetch: vi.fn() };
});

import { apiFetch } from "../api/client";
import { FicheAgent } from "./FicheAgent";

const AGENT_ID = "22222222-2222-2222-2222-222222222222";

const UTILISATEUR: UtilisateurConnecte = {
  id: "u1",
  identifiant: "test.saisie",
  nom: "Testeur",
  role: "SAISIE",
  actif: true,
  doitChangerMotDePasse: false,
};

const AGENT_CONGE_DEPASSE: AgentDetail = {
  id: AGENT_ID,
  matricule: "M-2020-001",
  nom: "Kaboré",
  prenom: "Awa",
  sexe: "FEMININ",
  dateNaissance: null,
  lieuNaissance: null,
  situationMatrimoniale: null,
  telephone: null,
  adresse: null,
  numeroCnss: null,
  fonction: "Infirmière",
  dateRecrutement: "2020-01-01",
  typeContrat: "CDI",
  photoPath: null,
  serviceId: "s1",
  service: { id: "s1", nom: "Urgences", code: "URG" },
  statut: "CONGE_DEPASSE",
  mouvements: [
    {
      id: "m1",
      agentId: AGENT_ID,
      type: "CONGE",
      dateEffet: "2024-01-01",
      dateFin: "2024-01-10",
      motif: null,
      documentId: null,
      saisiParId: "u1",
      saisiPar: { nom: "Testeur" },
      createdAt: "2024-01-01T00:00:00.000Z",
      annuleLe: null,
      annuleParId: null,
      annulePar: null,
      motifAnnulation: null,
    },
  ],
  documents: [],
};

function rendreFicheAgent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/personnel/${AGENT_ID}`]}>
        <Routes>
          <Route path="/personnel/:id" element={<FicheAgent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FicheAgent — bandeau CONGE_DEPASSE", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (chemin) => {
      if (chemin === "/api/auth/moi") return UTILISATEUR;
      if (chemin === `/api/agents/${AGENT_ID}`) return AGENT_CONGE_DEPASSE;
      throw new Error(`apiFetch non mocké pour ${String(chemin)}`);
    });
  });

  it("le bandeau apparaît avec la date de fin de congé et son bouton pré-remplit la date d'effet de la modale", async () => {
    rendreFicheAgent();

    const banniere = await screen.findByText(/aucun retour n'a été saisi/i);
    expect(banniere.textContent).toMatch(/10\/01\/2024/);

    fireEvent.click(screen.getByRole("button", { name: /saisir un mouvement/i }));

    const champDateEffet = await screen.findByLabelText(/date d'effet/i);
    expect(champDateEffet).toHaveValue("2024-01-11");
  });
});
