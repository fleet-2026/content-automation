/**
 * Magic-byte detection for the file types we accept on uploads.
 * Returns the canonical extension + mime type, or null for unknown / disallowed.
 *
 * Never trust client-supplied filename or MIME type — always sniff.
 */

export type SniffedType = {
  ext:
    | "jpg" | "png" | "webp" | "gif"
    | "mp4" | "mov" | "webm"
    | "mp3" | "m4a" | "wav"
    | "pdf" | "docx" | "doc" | "zip";
  mime: string;
};

const ALLOWED_MIMES_BY_EXT: Record<SniffedType["ext"], string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  zip: "application/zip",
};

function bytesAt(buf: Uint8Array, offset: number, expected: number[]): boolean {
  if (buf.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) return false;
  }
  return true;
}

function asciiAt(buf: Uint8Array, offset: number, str: string): boolean {
  if (buf.length < offset + str.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (buf[offset + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

export function sniffFileType(buf: Uint8Array): SniffedType | null {
  // ── Images ─────────────────────────────────────────
  // JPEG: FF D8 FF
  if (bytesAt(buf, 0, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", mime: "image/png" };
  }
  // GIF: "GIF87a" or "GIF89a"
  if (asciiAt(buf, 0, "GIF87a") || asciiAt(buf, 0, "GIF89a")) {
    return { ext: "gif", mime: "image/gif" };
  }
  // WebP: "RIFF" + 4 bytes + "WEBP"
  if (asciiAt(buf, 0, "RIFF") && asciiAt(buf, 8, "WEBP")) {
    return { ext: "webp", mime: "image/webp" };
  }

  // ── Audio ──────────────────────────────────────────
  // MP3: ID3 tag or 0xFF 0xFB/0xF3/0xF2 (MPEG audio frame)
  if (asciiAt(buf, 0, "ID3")) return { ext: "mp3", mime: "audio/mpeg" };
  if (
    buf[0] === 0xff &&
    (buf[1] === 0xfb || buf[1] === 0xf3 || buf[1] === 0xf2 || buf[1] === 0xfa)
  ) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  // WAV: "RIFF" + 4 bytes + "WAVE"
  if (asciiAt(buf, 0, "RIFF") && asciiAt(buf, 8, "WAVE")) {
    return { ext: "wav", mime: "audio/wav" };
  }

  // ── Video / MP4 family ─────────────────────────────
  // ISO BMFF: bytes 4..8 == "ftyp", then a 4-byte brand
  if (asciiAt(buf, 4, "ftyp")) {
    // Brands at offset 8..12
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (brand === "qt  ") return { ext: "mov", mime: "video/quicktime" };
    if (
      brand === "M4A " ||
      brand === "M4B " ||
      brand === "M4P " ||
      brand === "M4V " ||
      brand.startsWith("mp4") ||
      brand === "isom" ||
      brand === "iso2" ||
      brand === "avc1" ||
      brand === "dash"
    ) {
      // M4A audio vs MP4 video — sniff by brand prefix
      if (brand === "M4A ") return { ext: "m4a", mime: "audio/mp4" };
      return { ext: "mp4", mime: "video/mp4" };
    }
    // Unknown ISOBMFF brand — treat as mp4 (most common)
    return { ext: "mp4", mime: "video/mp4" };
  }

  // WebM / Matroska: 0x1A 0x45 0xDF 0xA3 (EBML)
  if (bytesAt(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { ext: "webm", mime: "video/webm" };
  }

  // ── Documents (guide-file uploads) ─────────────────
  // PDF: "%PDF"
  if (asciiAt(buf, 0, "%PDF")) {
    return { ext: "pdf", mime: "application/pdf" };
  }
  // Legacy MS Office (OLE2 compound binary): D0 CF 11 E0 A1 B1 1A E1 → .doc
  if (bytesAt(buf, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { ext: "doc", mime: "application/msword" };
  }
  // ZIP container: "PK\x03\x04". A .docx is a zip whose first entry is
  // "[Content_Types].xml" (OOXML convention) — peek it to tell a Word doc
  // from a plain .zip so the stored file keeps the right extension.
  if (bytesAt(buf, 0, [0x50, 0x4b, 0x03, 0x04])) {
    if (asciiAt(buf, 30, "[Content_Types].xml") || asciiAt(buf, 30, "word/")) {
      return {
        ext: "docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    return { ext: "zip", mime: "application/zip" };
  }

  return null;
}

/** Public allowlist for the upload route. */
export function isAllowedExt(ext: string): ext is SniffedType["ext"] {
  return ext in ALLOWED_MIMES_BY_EXT;
}
