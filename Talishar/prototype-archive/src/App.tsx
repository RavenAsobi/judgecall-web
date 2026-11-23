import { useCallback, useState } from "react";
import { GameBoard } from "./features/practice/GameBoard";
import { PracticeLobby } from "./features/practice/PracticeLobby";
import type { AppScreen, ImportedDeck, PracticeSession } from "./types";

const STORAGE_KEY = "nimblism:sessions:v1";

function readStoredSessions(): PracticeSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PracticeSession[]) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>("lobby");
  const [activeDeck, setActiveDeck] = useState<ImportedDeck | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>(readStoredSessions);
  const [activeSession, setActiveSession] = useState<PracticeSession | null>(null);

  const persistSessions = useCallback((next: PracticeSession[]) => {
    setSessions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const startPractice = useCallback(
    (deck: ImportedDeck) => {
      const session: PracticeSession = {
        id: `practice-${Date.now()}`,
        deckName: deck.name,
        opponent: "Fai",
        startedAt: new Date().toISOString(),
        status: "in-progress",
      };
      const nextSessions = [session, ...sessions].slice(0, 6);
      persistSessions(nextSessions);
      setActiveDeck(deck);
      setActiveSession(session);
      setScreen("game");
      window.scrollTo({ top: 0 });
    },
    [persistSessions, sessions],
  );

  const completeSession = useCallback(
    (sessionId: string) => {
      persistSessions(
        sessions.map((session) =>
          session.id === sessionId ? { ...session, status: "completed" } : session,
        ),
      );
    },
    [persistSessions, sessions],
  );

  const leavePractice = useCallback(() => {
    setScreen("lobby");
    setActiveDeck(null);
    setActiveSession(null);
    window.scrollTo({ top: 0 });
  }, []);

  if (screen === "game" && activeDeck && activeSession) {
    return (
      <GameBoard
        deck={activeDeck}
        session={activeSession}
        onLeave={leavePractice}
        onComplete={completeSession}
      />
    );
  }

  return <PracticeLobby sessions={sessions} onStart={startPractice} />;
}
