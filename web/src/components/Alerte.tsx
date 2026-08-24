import type { ReactNode } from "react";
import { Bouton } from "./Bouton";

interface AlerteProps {
  titre: string;
  description?: ReactNode;
  action?: { libelle: string; onClick: () => void };
  variante?: "erreur" | "info";
}

/** Bandeau d'état plein (erreur réseau, aucun résultat, serveur injoignable...). */
export function Alerte({ titre, description, action, variante = "info" }: AlerteProps) {
  return (
    <div
      role={variante === "erreur" ? "alert" : "status"}
      className={`flex flex-col items-start gap-3 border p-6 ${
        variante === "erreur" ? "border-primaire" : "border-bordure"
      }`}
    >
      <p className="text-sm font-medium text-texte-fort">{titre}</p>
      {description && <p className="text-sm text-texte-faible">{description}</p>}
      {action && (
        <Bouton variante="secondaire" onClick={action.onClick}>
          {action.libelle}
        </Bouton>
      )}
    </div>
  );
}
