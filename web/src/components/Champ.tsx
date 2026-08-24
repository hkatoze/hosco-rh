import { forwardRef, type InputHTMLAttributes } from "react";

interface ChampProps extends InputHTMLAttributes<HTMLInputElement> {
  etiquette?: string;
  erreur?: string;
}

export const Champ = forwardRef<HTMLInputElement, ChampProps>(function Champ(
  { etiquette, erreur, id, className = "", ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      {etiquette && (
        <label htmlFor={id} className="text-sm font-medium text-texte-fort">
          {etiquette}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`border bg-fond-carte px-3 py-2 text-sm text-texte-fort placeholder:text-texte-faible ${
          erreur ? "border-primaire" : "border-bordure"
        } ${className}`}
        aria-invalid={erreur ? true : undefined}
        {...props}
      />
      {erreur && <p className="text-sm text-primaire">{erreur}</p>}
    </div>
  );
});
