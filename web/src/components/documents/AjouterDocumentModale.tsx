import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deposerDocument } from "../../api/uploadDocument";
import { ErreurApi } from "../../api/client";
import { formaterTaille } from "../../lib/validationFichier";
import type { TypeDocument } from "../../api/types";
import { Modale } from "../Modale";
import { Bouton } from "../Bouton";
import { DeposeDocument } from "./DeposeDocument";

interface AjouterDocumentModaleProps {
  agentId: string;
  ouverte: boolean;
  onFermer: () => void;
}

interface FichierEnAttente {
  fichier: File;
  type: TypeDocument;
  erreur?: string;
}

export function AjouterDocumentModale({ agentId, ouverte, onFermer }: AjouterDocumentModaleProps) {
  const queryClient = useQueryClient();
  const [fichiersEnAttente, setFichiersEnAttente] = useState<FichierEnAttente[]>([]);
  const [envoi, setEnvoi] = useState<{ index: number; total: number; progression: number } | null>(null);

  function surFermeture() {
    if (fichiersEnAttente.length > 0 && !window.confirm("Les fichiers ajoutés mais non enregistrés seront perdus. Continuer ?")) return;
    onFermer();
  }

  async function enregistrer() {
    const restants: FichierEnAttente[] = [];
    for (let i = 0; i < fichiersEnAttente.length; i++) {
      const { fichier, type } = fichiersEnAttente[i]!;
      setEnvoi({ index: i + 1, total: fichiersEnAttente.length, progression: 0 });
      try {
        await deposerDocument(agentId, fichier, type, (progression) => setEnvoi((e) => (e ? { ...e, progression } : e)));
      } catch (erreur) {
        restants.push({ fichier, type, erreur: erreur instanceof ErreurApi ? erreur.message : "Échec de l'envoi du fichier." });
      }
    }
    setEnvoi(null);
    setFichiersEnAttente(restants);
    await queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    if (restants.length === 0) onFermer();
  }

  return (
    <Modale ouverte={ouverte} titre="Ajouter un document" onFermer={surFermeture}>
      <div className="flex flex-col gap-4">
        <DeposeDocument onFichier={async (fichier, type) => setFichiersEnAttente((liste) => [...liste, { fichier, type }])} />

        {fichiersEnAttente.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-texte-faible">
            {fichiersEnAttente.map((f, i) => (
              <li key={i} className="flex flex-col gap-1 border border-bordure px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {f.fichier.name} — {formaterTaille(f.fichier.size)}
                  </span>
                  {envoi === null && (
                    <button
                      type="button"
                      onClick={() => setFichiersEnAttente((liste) => liste.filter((_, idx) => idx !== i))}
                      className="ml-3 shrink-0 text-primaire"
                      aria-label={`retirer ${f.fichier.name}`}
                    >
                      retirer
                    </button>
                  )}
                </div>
                {f.erreur && <p className="text-xs text-primaire">{f.erreur}</p>}
                {envoi && envoi.index === i + 1 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-full border border-bordure">
                      <div className="h-full bg-primaire transition-all" style={{ width: `${envoi.progression}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs">{envoi.progression}%</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Bouton type="button" variante="discret" onClick={surFermeture} disabled={envoi !== null}>
            annuler
          </Bouton>
          <Bouton type="button" variante="primaire" onClick={() => void enregistrer()} disabled={fichiersEnAttente.length === 0 || envoi !== null}>
            {envoi ? `enregistrement (${envoi.index}/${envoi.total})…` : "enregistrer"}
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}
