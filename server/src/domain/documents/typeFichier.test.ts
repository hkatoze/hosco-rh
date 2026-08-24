import { describe, expect, it } from "vitest";
import { detecterTypeFichier } from "./typeFichier";

describe("detecterTypeFichier", () => {
  it("reconnaît un PDF (%PDF)", () => {
    expect(detecterTypeFichier(Buffer.from("%PDF-1.4\n..."))).toBe("PDF");
  });

  it("reconnaît un JPEG (FF D8 FF)", () => {
    expect(detecterTypeFichier(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("JPEG");
  });

  it("reconnaît un PNG (89 50 4E 47 0D 0A 1A 0A)", () => {
    expect(detecterTypeFichier(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]))).toBe("PNG");
  });

  it("refuse un exécutable Windows (MZ) même renommé en .pdf", () => {
    // En-tête réel d'un .exe : "MZ" suivi d'octets DOS-stub.
    const enteteExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(detecterTypeFichier(enteteExe)).toBeNull();
  });

  it("refuse un script shell malgré une extension .pdf", () => {
    expect(detecterTypeFichier(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
  });

  it("refuse un buffer vide ou trop court", () => {
    expect(detecterTypeFichier(Buffer.alloc(0))).toBeNull();
    expect(detecterTypeFichier(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  it("ne se laisse pas abuser par un Content-Type ou une extension mentant sur le contenu", () => {
    // Contenu réellement JPEG, peu importe ce qu'un client prétendrait via
    // le nom de fichier ou l'en-tête Content-Type — non testé ici car
    // detecterTypeFichier ne reçoit que les octets, jamais ces métadonnées.
    const octetsJpeg = Buffer.from([0xff, 0xd8, 0xff]);
    expect(detecterTypeFichier(octetsJpeg)).toBe("JPEG");
  });
});
