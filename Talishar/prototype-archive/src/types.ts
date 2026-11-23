export type AppScreen = "lobby" | "game";

export interface ImportedDeck {
  id: string;
  sourceUrl: string;
  name: string;
  hero: string;
  cardCount: number;
  source: "adapter" | "sandbox";
}

export interface PracticeSession {
  id: string;
  deckName: string;
  opponent: "Fai";
  startedAt: string;
  status: "in-progress" | "completed";
}

export type CardPitch = 1 | 2 | 3;

export interface TrainingCard {
  id: string;
  name: string;
  image: string;
  type: string;
  lesson: string;
  pitch: CardPitch;
  cost: number;
  attack?: number;
  defense: number;
}

export type GamePhase = "action" | "pitch" | "ai-turn" | "complete";

export interface LogEntry {
  id: string;
  actor: "You" | "Fai — AI" | "Nimblism";
  message: string;
}
