import { memo, useCallback, useMemo, useState } from "react";
import { Brand } from "../../components/Brand";
import {
  BookIcon,
  BotIcon,
  HelpIcon,
  PassIcon,
  PlayIcon,
  SettingsIcon,
  SwordIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { TRAINING_HAND } from "../../data/cards";
import type {
  GamePhase,
  ImportedDeck,
  LogEntry,
  PracticeSession,
  TrainingCard,
} from "../../types";

interface GameBoardProps {
  deck: ImportedDeck;
  session: PracticeSession;
  onLeave: () => void;
  onComplete: (sessionId: string) => void;
}

interface TrainingCardViewProps {
  card: TrainingCard;
  selected: boolean;
  unavailable: boolean;
  onSelect: (cardId: string) => void;
}

const TrainingCardView = memo(function TrainingCardView({
  card,
  selected,
  unavailable,
  onSelect,
}: TrainingCardViewProps) {
  return (
    <button
      className={`training-card${selected ? " training-card--selected" : ""}`}
      type="button"
      aria-label={card.name}
      aria-pressed={selected}
      disabled={unavailable}
      onClick={() => onSelect(card.id)}
    >
      <span className="training-card__name">{card.name}</span>
      <img src={card.image} alt="" />
      <span className="training-card__type">{card.type}</span>
      <span className="training-card__lesson">{card.lesson}</span>
      <span className={`training-card__pitch training-card__pitch--${card.pitch}`} aria-label={`Pitch ${card.pitch}`}>
        {card.pitch}
      </span>
      {typeof card.attack === "number" ? (
        <span className="training-card__attack" aria-label={`Attack ${card.attack}`}>
          {card.attack}
        </span>
      ) : null}
      <span className="training-card__defense" aria-label={`Defense ${card.defense}`}>
        {card.defense}
      </span>
    </button>
  );
});

function ZoneCard({ label, count = 0 }: { label: string; count?: number }) {
  return (
    <div className="zone-card">
      <span className="zone-card__label">{label}</span>
      <div className="zone-card__slot">
        <img src="/assets/nimblism-mark.png" alt="" />
      </div>
      <span className="zone-card__count">{count}</span>
    </div>
  );
}

export function GameBoard({ deck, session, onLeave, onComplete }: GameBoardProps) {
  const [selectedId, setSelectedId] = useState("guarded-mind");
  const [hand, setHand] = useState(TRAINING_HAND);
  const [pitchZone, setPitchZone] = useState<TrainingCard[]>([]);
  const [combatChain, setCombatChain] = useState<TrainingCard[]>([]);
  const [resources, setResources] = useState(0);
  const [playerLife, setPlayerLife] = useState(40);
  const [faiLife, setFaiLife] = useState(40);
  const [phase, setPhase] = useState<GamePhase>("action");
  const [turn, setTurn] = useState(1);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [modal, setModal] = useState<"rules" | "settings" | "leave" | "lesson" | null>(null);
  const [toast, setToast] = useState(
    deck.source === "sandbox"
      ? "Training sandbox loaded. Connect a deck-import adapter for real Fabrary card data."
      : `${deck.name} imported from Fabrary.`,
  );
  const [log, setLog] = useState<LogEntry[]>([
    { id: "start", actor: "Nimblism", message: "Practice Mode enabled." },
    { id: "fai", actor: "Fai — AI", message: "Mulliganed to 6." },
    { id: "turn", actor: "You", message: "Your action phase begins." },
  ]);

  const selectedCard = useMemo(
    () => hand.find((card) => card.id === selectedId) ?? null,
    [hand, selectedId],
  );

  const promptCopy = useMemo(() => {
    if (phase === "pitch") {
      const pendingCard = hand.find((card) => card.id === pendingCardId);
      return {
        title: "Pitch a card",
        body: `${pendingCard?.name ?? "That action"} costs ${pendingCard?.cost ?? 0}. Select a card to pitch for resources.`,
      };
    }
    if (phase === "ai-turn") {
      return {
        title: "Fai is thinking",
        body: "Watch the log and keep cards with defense value ready for the response window.",
      };
    }
    if (phase === "complete") {
      return {
        title: "Lesson complete",
        body: "You played through the action-point and pitching loop. Restart to try another line.",
      };
    }
    return {
      title: "Choose your action",
      body: selectedCard
        ? selectedCard.lesson
        : "Pitching a blue card gives 3 resources. Select a card from your hand, then choose an action.",
    };
  }, [hand, pendingCardId, phase, selectedCard]);

  const addLog = useCallback((actor: LogEntry["actor"], message: string) => {
    setLog((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, actor, message },
    ]);
  }, []);

  const playCard = useCallback(() => {
    if (!selectedCard || phase !== "action") {
      setToast("Select a card in your hand first.");
      return;
    }

    if (selectedCard.cost > resources) {
      setPendingCardId(selectedCard.id);
      setPhase("pitch");
      setToast(`Pitch a card to pay ${selectedCard.cost} resource${selectedCard.cost === 1 ? "" : "s"}.`);
      return;
    }

    setResources((current) => current - selectedCard.cost);
    setHand((current) => current.filter((card) => card.id !== selectedCard.id));
    setCombatChain((current) => [...current, selectedCard]);
    setSelectedId("");
    addLog("You", `Played ${selectedCard.name}${selectedCard.attack ? ` for ${selectedCard.attack}` : ""}.`);
    setToast(`${selectedCard.name} is on the combat chain.`);
  }, [addLog, phase, resources, selectedCard]);

  const pitchSelected = useCallback(() => {
    if (!selectedCard || phase !== "pitch" || selectedCard.id === pendingCardId) {
      setToast("Select a different card to pitch.");
      return;
    }

    setHand((current) => current.filter((card) => card.id !== selectedCard.id));
    setPitchZone((current) => [...current, selectedCard]);
    setResources((current) => current + selectedCard.pitch);
    setSelectedId(pendingCardId ?? "");
    setPhase("action");
    addLog("You", `Pitched ${selectedCard.name} for ${selectedCard.pitch} resources.`);
    setToast(`${selectedCard.pitch} resources ready. Play the selected action now.`);
  }, [addLog, pendingCardId, phase, selectedCard]);

  const useWeapon = useCallback(() => {
    if (phase !== "action") return;
    if (resources < 1) {
      setPendingCardId("weapon");
      setPhase("pitch");
      setSelectedId("");
      setToast("The training blade costs 1 resource. Select a card to pitch.");
      return;
    }
    setResources((current) => current - 1);
    addLog("You", "Attacked with the training blade for 2.");
    setFaiLife((current) => Math.max(0, current - 2));
    setToast("Weapon attack resolved. Notice how it used your action point.");
  }, [addLog, phase, resources]);

  const passPriority = useCallback(() => {
    if (phase !== "action") return;
    setPhase("ai-turn");
    addLog("You", "Passed priority.");
    setToast("Fai is taking a short, scripted teaching turn.");
    window.setTimeout(() => {
      setPlayerLife((current) => Math.max(0, current - 3));
      setCombatChain([]);
      setPitchZone([]);
      setResources(0);
      setTurn((current) => current + 1);
      setPhase("action");
      addLog("Fai — AI", "Presented a 3-power attack. You defended and return to your action phase.");
      setToast("New turn: compare your hand size with the life you protected.");
    }, 900);
  }, [addLog, phase]);

  const restartLesson = useCallback(() => {
    setHand(TRAINING_HAND);
    setPitchZone([]);
    setCombatChain([]);
    setResources(0);
    setPlayerLife(40);
    setFaiLife(40);
    setPhase("action");
    setTurn(1);
    setPendingCardId(null);
    setSelectedId("guarded-mind");
    setLog([
      { id: "restart", actor: "Nimblism", message: "Lesson restarted." },
      { id: "turn-restart", actor: "You", message: "Your action phase begins." },
    ]);
    setToast("Lesson restarted.");
  }, []);

  const currentDeckCount = Math.max(0, deck.cardCount - pitchZone.length - combatChain.length);
  const unavailable = phase === "ai-turn" || phase === "complete";

  return (
    <div className="game-shell">
      <header className="game-header">
        <Brand compact />
        <div className="game-header__title">
          <span>Practice vs Fai</span>
          <small>{deck.source === "adapter" ? deck.name : "Training sandbox"}</small>
        </div>
        <div className="game-header__actions">
          <button type="button" className="button button--game" onClick={() => setModal("rules")}>
            <BookIcon />
            Rules
          </button>
          <button type="button" className="button button--game" onClick={() => setModal("settings")}>
            <SettingsIcon />
            Settings
          </button>
          <button type="button" className="button button--danger" onClick={() => setModal("leave")}>
            Leave
          </button>
        </div>
      </header>

      <main className={`game-layout${logOpen ? "" : " game-layout--log-closed"}`}>
        <aside className={`game-log${logOpen ? "" : " game-log--closed"}`}>
          <button
            className="game-log__toggle"
            type="button"
            aria-expanded={logOpen}
            onClick={() => setLogOpen((current) => !current)}
          >
            <span>{logOpen ? "Game Log" : "Log"}</span>
            <span aria-hidden="true">{logOpen ? "‹" : "›"}</span>
          </button>
          {logOpen ? (
            <ol>
              {log.slice(-6).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.actor}</strong>
                  <span>{entry.message}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </aside>

        <section className="battlefield" aria-label="Practice battlefield">
          <div className="player-row player-row--opponent">
            <div className="player-identity player-identity--fai">
              <div className="player-identity__avatar">
                <BotIcon />
              </div>
              <div>
                <strong>Fai — AI</strong>
                <span className="life life--fai">♥ {faiLife}</span>
              </div>
            </div>
            <div className="zone-group">
              <ZoneCard label="Arsenal" />
              <div className="weapon-zone">
                <span>Weapon</span>
                <div className="weapon-zone__blade">
                  <SwordIcon />
                </div>
                <small>1</small>
              </div>
              <div className="pitch-slots" aria-label="Fai pitch zone">
                <span>Pitch zone</span>
                <i />
                <i />
                <i />
              </div>
              <ZoneCard label="Graveyard" />
              <ZoneCard label="Banished" />
            </div>
          </div>

          <div className="combat-area">
            <span className="combat-area__label">Combat chain</span>
            <div className="combat-track">
              <span className="combat-track__end" />
              {[0, 1, 2, 3, 4, 5, 6].map((node) => {
                const chainCard = combatChain[node];
                return (
                  <span
                    className={`combat-track__node${chainCard ? " combat-track__node--filled" : ""}`}
                    key={node}
                    title={chainCard?.name}
                  >
                    {chainCard ? <img src={chainCard.image} alt={chainCard.name} /> : null}
                  </span>
                );
              })}
              <span className="combat-track__end" />
            </div>
            <div className="turn-banner">
              Turn {turn} <span>·</span>{" "}
              {phase === "ai-turn" ? "Fai's turn" : "Your action phase"}
            </div>
          </div>

          <div className="player-row player-row--you">
            <div className="player-identity">
              <div className="player-identity__avatar">
                <img src="/assets/nimblism-mark.png" alt="" />
              </div>
              <div>
                <strong>You</strong>
                <span className="life">♥ {playerLife}</span>
              </div>
              <div className="resource-count" aria-label={`${resources} resources`}>
                <span>{resources}</span>
                <small>Resources</small>
              </div>
            </div>
            <div className="zone-group">
              <ZoneCard label="Arsenal" />
              <div className="weapon-zone">
                <span>Weapon</span>
                <div className="weapon-zone__blade weapon-zone__blade--you">
                  <SwordIcon />
                </div>
                <small>1</small>
              </div>
              <div className="pitch-slots" aria-label="Your pitch zone">
                <span>Pitch zone</span>
                {[0, 1, 2].map((slot) => {
                  const card = pitchZone[slot];
                  return (
                    <i className={card ? "pitch-slot--filled" : ""} key={slot}>
                      {card ? <img src={card.image} alt={card.name} /> : null}
                    </i>
                  );
                })}
              </div>
              <ZoneCard label="Graveyard" />
              <ZoneCard label="Banished" />
            </div>
          </div>

          <div className="hand-bar" aria-label={`Your hand, ${hand.length} cards`}>
            <div className="deck-count">
              <span>Deck</span>
              <strong>{currentDeckCount}</strong>
            </div>
            <div className="hand-cards">
              {hand.map((card) => (
                <TrainingCardView
                  key={card.id}
                  card={card}
                  selected={selectedId === card.id}
                  unavailable={unavailable}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="decision-panel" aria-live="polite">
          <div>
            <span className="decision-panel__turn">Turn {turn} · Guided prompt</span>
            <h1>{promptCopy.title}</h1>
            <p>{promptCopy.body}</p>
            {selectedCard ? (
              <div className="selected-summary">
                <img src={selectedCard.image} alt="" />
                <div>
                  <strong>{selectedCard.name}</strong>
                  <span>
                    Cost {selectedCard.cost} · Pitch {selectedCard.pitch}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="decision-actions">
            {phase === "pitch" ? (
              <button
                className="button button--primary button--full"
                type="button"
                disabled={!selectedCard || selectedCard.id === pendingCardId}
                onClick={pitchSelected}
              >
                Pitch selected card
              </button>
            ) : (
              <>
                <button
                  className="button button--primary button--full"
                  type="button"
                  disabled={unavailable}
                  onClick={playCard}
                >
                  <PlayIcon />
                  Play card
                </button>
                <button
                  className="button button--outline button--full"
                  type="button"
                  disabled={unavailable}
                  onClick={useWeapon}
                >
                  <SwordIcon />
                  Use weapon
                </button>
                <button
                  className="button button--outline button--full"
                  type="button"
                  disabled={unavailable}
                  onClick={passPriority}
                >
                  <PassIcon />
                  Pass
                </button>
              </>
            )}
            <button
              className="button button--ghost button--full"
              type="button"
              onClick={() => setModal("lesson")}
            >
              <HelpIcon />
              Why this matters
            </button>
          </div>

          <div className="decision-panel__footer">
            <span>Practice Mode on</span>
            <button type="button" onClick={() => setLogOpen((current) => !current)}>
              {logOpen ? "Hide log" : "Show log"}
            </button>
          </div>
        </aside>
      </main>

      {toast ? (
        <button className="toast" type="button" onClick={() => setToast("")} aria-label="Dismiss message">
          {toast}
        </button>
      ) : null}

      {modal === "rules" ? (
        <Modal title="Practice rules" onClose={() => setModal(null)}>
          <div className="rules-grid">
            <div>
              <strong>1 · Select</strong>
              <span>Choose a card in your hand to inspect its cost, pitch, and lesson.</span>
            </div>
            <div>
              <strong>2 · Pitch</strong>
              <span>If you need resources, pitch another card. Red gives 1, yellow 2, blue 3.</span>
            </div>
            <div>
              <strong>3 · Resolve</strong>
              <span>Play the action, follow the combat chain, then pass priority to Fai.</span>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "settings" ? (
        <Modal title="Practice settings" onClose={() => setModal(null)}>
          <div className="setting-row">
            <div>
              <strong>Guided prompts</strong>
              <span>Always on in this teaching build.</span>
            </div>
            <span className="setting-status">On</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Opponent</strong>
              <span>Fixed for a consistent lesson.</span>
            </div>
            <span className="setting-status">Fai</span>
          </div>
          <button className="button button--outline button--full" type="button" onClick={restartLesson}>
            Restart lesson
          </button>
        </Modal>
      ) : null}

      {modal === "lesson" ? (
        <Modal title="Why this matters" onClose={() => setModal(null)}>
          <p>
            A Flesh and Blood turn is a resource puzzle. Every card can become an effect, a defensive
            block, or pitch. The strongest line is often the one that preserves a useful option for the
            next priority window.
          </p>
          <p>
            In this sandbox, try pitching <strong>Deep Focus</strong>, playing{" "}
            <strong>Quickstep</strong>, and then passing to see the whole loop.
          </p>
        </Modal>
      ) : null}

      {modal === "leave" ? (
        <Modal
          title="Leave this practice?"
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="button button--ghost" type="button" onClick={() => setModal(null)}>
                Stay
              </button>
              <button
                className="button button--danger"
                type="button"
                onClick={() => {
                  onComplete(session.id);
                  onLeave();
                }}
              >
                Leave practice
              </button>
            </>
          }
        >
          <p>Your session will be saved in Practice Sessions.</p>
        </Modal>
      ) : null}
    </div>
  );
}
