import type { ImportedDeck } from "../types";

const FABRARY_DECK_URL =
  /^https?:\/\/(?:www\.)?fabrary\.net\/decks\/([a-z0-9_-]+)(?:[/?#].*)?$/i;

interface AdapterPayload {
  id?: string;
  name?: string;
  hero?: string;
  cardCount?: number;
}

export function parseFabraryDeckUrl(value: string): string | null {
  const match = value.trim().match(FABRARY_DECK_URL);
  return match?.[1] ?? null;
}

export async function importFabraryDeck(url: string): Promise<ImportedDeck> {
  const deckId = parseFabraryDeckUrl(url);
  if (!deckId) {
    throw new Error("Paste a public Fabrary deck URL to continue.");
  }

  const adapterUrl = import.meta.env.VITE_DECK_IMPORT_API?.trim();

  if (adapterUrl) {
    const response = await fetch(
      `${adapterUrl.replace(/\/$/, "")}?url=${encodeURIComponent(url)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error("The deck import service could not read this deck.");
    }

    const payload = (await response.json()) as AdapterPayload;
    return {
      id: payload.id ?? deckId,
      sourceUrl: url,
      name: payload.name ?? "Imported Fabrary Deck",
      hero: payload.hero ?? "Imported hero",
      cardCount: payload.cardCount ?? 60,
      source: "adapter",
    };
  }

  await Promise.resolve();

  return {
    id: deckId,
    sourceUrl: url,
    name: "Nimblism Training Deck",
    hero: "Imported deck sandbox",
    cardCount: 60,
    source: "sandbox",
  };
}
