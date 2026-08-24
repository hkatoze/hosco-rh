export type TypeFichierAccepte = "PDF" | "JPEG" | "PNG";

export const EXTENSION_PAR_TYPE: Record<TypeFichierAccepte, string> = {
  PDF: "pdf",
  JPEG: "jpg",
  PNG: "png",
};

export const MIME_PAR_TYPE: Record<TypeFichierAccepte, string> = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  PNG: "image/png",
};

const SIGNATURE_PDF = Buffer.from("%PDF");
const SIGNATURE_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Détermine le type réel d'un fichier à partir de ses octets d'en-tête
 * (magic bytes) — jamais depuis l'extension du nom ou le Content-Type
 * envoyé par le client, qui se falsifient tous les deux trivialement.
 * Retourne null si le fichier n'est ni PDF, ni JPEG, ni PNG.
 */
export function detecterTypeFichier(premierMorceau: Buffer): TypeFichierAccepte | null {
  if (premierMorceau.subarray(0, SIGNATURE_PDF.length).equals(SIGNATURE_PDF)) return "PDF";
  if (premierMorceau.subarray(0, SIGNATURE_JPEG.length).equals(SIGNATURE_JPEG)) return "JPEG";
  if (premierMorceau.subarray(0, SIGNATURE_PNG.length).equals(SIGNATURE_PNG)) return "PNG";
  return null;
}
