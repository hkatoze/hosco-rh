import { statfs } from "node:fs/promises";

/** Octets réellement disponibles (pas seulement libres) sur le volume contenant `chemin`. */
export async function espaceDisponible(chemin: string): Promise<number> {
  const info = await statfs(chemin);
  return info.bavail * info.bsize;
}
