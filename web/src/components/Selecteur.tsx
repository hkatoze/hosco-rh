import { forwardRef, type SelectHTMLAttributes } from "react";

interface OptionSelecteur {
  valeur: string;
  libelle: string;
}

interface SelecteurProps extends SelectHTMLAttributes<HTMLSelectElement> {
  etiquette?: string;
  erreur?: string;
  options: OptionSelecteur[];
}

export const Selecteur = forwardRef<HTMLSelectElement, SelecteurProps>(function Selecteur(
  { etiquette, erreur, options, id, className = "", ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      {etiquette && (
        <label htmlFor={id} className="text-sm font-medium text-texte-fort">
          {etiquette}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`border bg-fond-carte px-3 py-2 text-sm text-texte-fort ${erreur ? "border-primaire" : "border-bordure"} ${className}`}
        aria-invalid={erreur ? true : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {erreur && <p className="text-sm text-primaire">{erreur}</p>}
    </div>
  );
});
