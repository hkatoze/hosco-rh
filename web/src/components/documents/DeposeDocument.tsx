import { useRef, useState } from "react";
import { TYPES_DOCUMENT, LIBELLE_TYPE_DOCUMENT, EXTENSIONS_ACCEPTEES } from "../../../../shared/document";
import type { TypeDocument } from "../../api/types";
import { ErreurApi } from "../../api/client";
import { validerFichierAvantEnvoi } from "../../lib/validationFichier";
import { Selecteur } from "../Selecteur";

interface DeposeDocumentProps {
  /**
   * Envoie réellement un fichier (upload immédiat vers un agent existant,
   * ou simple mise en file d'attente en création — voir CLAUDE.md, tâche 6,
   * point 5 : "envoi de plusieurs fichiers à la suite, un par un").
   */
  onFichier: (fichier: File, type: TypeDocument, onProgression: (pourcentage: number) => void) => Promise<void>;
}

/** Zone de glisser-déposer carrée + sélecteur classique, un type obligatoire avant l'envoi. */
export function DeposeDocument({ onFichier }: DeposeDocumentProps) {
  const [type, setType] = useState<TypeDocument | "">("");
  const [survole, setSurvole] = useState(false);
  const [enCours, setEnCours] = useState<{ nom: string; progression: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const refInput = useRef<HTMLInputElement>(null);

  async function traiterFichiers(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    if (!type) {
      setErreur("Sélectionnez un type de document avant l'envoi.");
      return;
    }
    setErreur(null);

    // Un par un, jamais en parallèle (voir CLAUDE.md).
    for (const fichier of Array.from(fichiers)) {
      const erreurClient = validerFichierAvantEnvoi(fichier, EXTENSIONS_ACCEPTEES);
      if (erreurClient) {
        setErreur(`${fichier.name} : ${erreurClient}`);
        continue;
      }
      setEnCours({ nom: fichier.name, progression: 0 });
      try {
        await onFichier(fichier, type, (progression) => setEnCours({ nom: fichier.name, progression }));
      } catch (e) {
        setErreur(e instanceof ErreurApi ? e.message : "Échec de l'envoi du fichier.");
      }
    }
    setEnCours(null);
    if (refInput.current) refInput.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <Selecteur
        id="type-document"
        etiquette="Type de document"
        value={type}
        onChange={(e) => setType(e.target.value as TypeDocument)}
        options={[{ valeur: "", libelle: "Sélectionnez…" }, ...TYPES_DOCUMENT.map((t) => ({ valeur: t, libelle: LIBELLE_TYPE_DOCUMENT[t] }))]}
      />

      <div
        className={`flex aspect-square w-full max-w-[14rem] flex-col items-center justify-center gap-2 border-2 border-dashed p-4 text-center text-sm ${
          survole ? "border-primaire bg-primaire/5" : "border-bordure"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvole(true);
        }}
        onDragLeave={() => setSurvole(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvole(false);
          void traiterFichiers(e.dataTransfer.files);
        }}
      >
        {enCours ? (
          <div className="flex w-full flex-col gap-2">
            <p className="truncate text-texte-faible">{enCours.nom}</p>
            <div className="h-1.5 w-full border border-bordure">
              <div className="h-full bg-primaire transition-all" style={{ width: `${enCours.progression}%` }} />
            </div>
            <p className="text-xs text-texte-faible">{enCours.progression}%</p>
          </div>
        ) : (
          <>
            <p className="text-texte-faible">glissez-déposez un fichier ici</p>
            <button type="button" onClick={() => refInput.current?.click()} className="border border-bordure px-3 py-1.5 text-texte-fort hover:border-texte-faible">
              ou choisir un fichier
            </button>
            <p className="text-xs text-texte-faible">PDF, JPG, PNG — 10 Mo max</p>
          </>
        )}
        <input
          ref={refInput}
          type="file"
          accept={EXTENSIONS_ACCEPTEES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => void traiterFichiers(e.target.files)}
        />
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-primaire">
          {erreur}
        </p>
      )}
    </div>
  );
}
