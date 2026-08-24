import type { ReactNode } from "react";

export function Tableau({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-bordure bg-fond-carte shadow-carte">
      <table className="w-full min-w-max border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function EnteteTableau({ children }: { children: ReactNode }) {
  return <thead className="border-b border-bordure bg-fond-page text-xs font-medium text-texte-faible">{children}</thead>;
}

export function CelluleEntete({
  children,
  onClick,
  triActif,
}: {
  children: ReactNode;
  onClick?: () => void;
  triActif?: "asc" | "desc" | false;
}) {
  return (
    <th scope="col" className="px-4 py-3">
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium text-texte-faible">
          {children}
          {triActif && <span aria-hidden="true">{triActif === "asc" ? "▲" : "▼"}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function LigneTableau({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-bordure last:border-b-0 ${onClick ? "cursor-pointer hover:bg-fond-page" : ""}`}
    >
      {children}
    </tr>
  );
}

export function Cellule({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-texte-fort">{children}</td>;
}

/** Ligne squelette : garde la hauteur/largeur du tableau pendant le chargement. */
export function LigneSquelette({ colonnes }: { colonnes: number }) {
  return (
    <tr className="border-b border-bordure last:border-b-0">
      {Array.from({ length: colonnes }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full max-w-[10rem] animate-pulse bg-bordure" />
        </td>
      ))}
    </tr>
  );
}
