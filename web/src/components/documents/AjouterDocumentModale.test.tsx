import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/uploadDocument", () => ({
  deposerDocument: vi.fn(),
}));

import { deposerDocument } from "../../api/uploadDocument";
import { ErreurApi } from "../../api/client";
import { AjouterDocumentModale } from "./AjouterDocumentModale";

function rendreModale(onFermer: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AjouterDocumentModale agentId="agent-1" ouverte onFermer={onFermer} />
    </QueryClientProvider>,
  );
}

function fichierInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]')!;
}

function ajouterFichier(nom = "cv.pdf") {
  fireEvent.change(screen.getByLabelText(/type de document/i), { target: { value: "CV" } });
  const fichier = new File(["contenu"], nom, { type: "application/pdf" });
  fireEvent.change(fichierInput(), { target: { files: [fichier] } });
}

describe("AjouterDocumentModale", () => {
  beforeEach(() => {
    vi.mocked(deposerDocument).mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("garde le fichier dans la liste au lieu de l'envoyer immédiatement", async () => {
    rendreModale(vi.fn());
    ajouterFichier();

    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument());
    expect(deposerDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^enregistrer$/i })).toBeEnabled();
  });

  it("le bouton enregistrer est désactivé tant qu'aucun fichier n'est en attente", () => {
    rendreModale(vi.fn());
    expect(screen.getByRole("button", { name: /^enregistrer$/i })).toBeDisabled();
  });

  it("retirer un fichier de la liste avant l'envoi ne l'envoie jamais", async () => {
    rendreModale(vi.fn());
    ajouterFichier();
    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /retirer cv\.pdf/i }));
    expect(screen.queryByText(/cv\.pdf/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^enregistrer$/i })).toBeDisabled();
  });

  it("enregistrer envoie le fichier avec progression puis ferme la modale", async () => {
    const onFermer = vi.fn();
    vi.mocked(deposerDocument).mockImplementation(async (_agentId, _fichier, _type, onProgression) => {
      onProgression(50);
      onProgression(100);
      return { id: "doc-1" } as never;
    });

    rendreModale(onFermer);
    ajouterFichier();
    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => expect(onFermer).toHaveBeenCalled());
    expect(deposerDocument).toHaveBeenCalledWith("agent-1", expect.any(File), "CV", expect.any(Function));
  });

  it("un échec d'envoi garde le fichier dans la liste avec un message d'erreur, la modale reste ouverte", async () => {
    const onFermer = vi.fn();
    vi.mocked(deposerDocument).mockRejectedValue(new ErreurApi("Fichier refusé par le serveur.", 422));

    rendreModale(onFermer);
    ajouterFichier();
    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => expect(screen.getByText("Fichier refusé par le serveur.")).toBeInTheDocument());
    expect(onFermer).not.toHaveBeenCalled();
    expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument();
  });

  it("fermer avec des fichiers non enregistrés demande confirmation", async () => {
    const onFermer = vi.fn();
    rendreModale(onFermer);
    ajouterFichier();
    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "annuler" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onFermer).toHaveBeenCalled();
  });

  it("fermer sans fichier en attente ne demande pas de confirmation", () => {
    const onFermer = vi.fn();
    rendreModale(onFermer);

    fireEvent.click(screen.getByRole("button", { name: "annuler" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(onFermer).toHaveBeenCalled();
  });
});
