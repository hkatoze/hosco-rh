import { ErreurApi } from "./client";
import type { DocumentAgent, TypeDocument } from "./types";

/**
 * Utilise XMLHttpRequest plutôt que fetch : c'est le seul moyen d'obtenir
 * une vraie progression d'envoi (upload.onprogress) — voir CLAUDE.md,
 * tâche 6, point 5 ("barre de progression réelle pendant l'envoi").
 */
export function deposerDocument(
  agentId: string,
  fichier: File,
  type: TypeDocument,
  onProgression: (pourcentage: number) => void,
): Promise<DocumentAgent> {
  return new Promise((resoudre, rejeter) => {
    const formulaire = new FormData();
    formulaire.append("type", type);
    formulaire.append("fichier", fichier);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/agents/${agentId}/documents`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgression(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let corps: unknown = null;
      try {
        corps = JSON.parse(xhr.responseText);
      } catch {
        // corps non-JSON : on garde le message générique ci-dessous
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resoudre(corps as DocumentAgent);
      } else {
        const message = (corps as { error?: string } | null)?.error ?? "Une erreur est survenue.";
        rejeter(new ErreurApi(message, xhr.status));
      }
    };
    xhr.onerror = () => rejeter(new ErreurApi("Serveur injoignable. Vérifiez la connexion au réseau local.", 0));

    xhr.send(formulaire);
  });
}

export function deposerPhotoAgent(agentId: string, fichier: File, onProgression: (pourcentage: number) => void): Promise<{ photoPath: string }> {
  return new Promise((resoudre, rejeter) => {
    const formulaire = new FormData();
    formulaire.append("fichier", fichier);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/agents/${agentId}/photo`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgression(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let corps: unknown = null;
      try {
        corps = JSON.parse(xhr.responseText);
      } catch {
        // corps non-JSON : on garde le message générique ci-dessous
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resoudre(corps as { photoPath: string });
      } else {
        const message = (corps as { error?: string } | null)?.error ?? "Une erreur est survenue.";
        rejeter(new ErreurApi(message, xhr.status));
      }
    };
    xhr.onerror = () => rejeter(new ErreurApi("Serveur injoignable. Vérifiez la connexion au réseau local.", 0));

    xhr.send(formulaire);
  });
}
