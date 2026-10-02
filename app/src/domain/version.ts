/** Fichier de code principal d'une page (« ./assets/index-XXXX.js ») : son nom change à chaque publication. */
export const scriptPrincipal = (html: string): string | null => /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/.exec(html)?.[1] ?? null;
