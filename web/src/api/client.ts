export class ErreurApi extends Error {
  status: number;
  code?: string;
  /** Champ de formulaire concerné par une erreur 422, si le serveur le précise. */
  champ?: string | null;

  constructor(message: string, status: number, code?: string, champ?: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.champ = champ;
  }
}

/**
 * Le cookie de session est httpOnly : ce client ne le lit ni ne le stocke
 * jamais. `credentials: "include"` suffit à ce qu'il soit envoyé par le
 * navigateur — aucune manipulation de token côté front.
 */
export async function apiFetch<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const reponse = await fetch(chemin, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  }).catch(() => {
    throw new ErreurApi("Serveur injoignable. Vérifiez la connexion au réseau local.", 0);
  });

  if (!reponse.ok) {
    let corps: { error?: string; code?: string; champ?: string | null } = {};
    try {
      corps = await reponse.json();
    } catch {
      // corps non-JSON : on garde le message générique
    }
    throw new ErreurApi(corps.error ?? "Une erreur est survenue.", reponse.status, corps.code, corps.champ);
  }

  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}
