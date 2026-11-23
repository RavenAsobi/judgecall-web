import { useCallback, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BotIcon, BookIcon, ChevronIcon, GlobeIcon, LinkIcon } from "../../components/Icons";
import { Brand } from "../../components/Brand";
import { LegalFooter } from "../../components/LegalFooter";
import { Modal } from "../../components/Modal";
import { importFabraryDeck, parseFabraryDeckUrl } from "../../services/deckImport";
import type { ImportedDeck, PracticeSession } from "../../types";

interface PracticeLobbyProps {
  sessions: PracticeSession[];
  onStart: (deck: ImportedDeck) => void;
}

type LobbyModal = "learn" | "about" | null;

export function PracticeLobby({ sessions, onStart }: PracticeLobbyProps) {
  const [deckUrl, setDeckUrl] = useState("");
  const [practiceMode, setPracticeMode] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<LobbyModal>(null);

  const parsedDeckId = useMemo(() => parseFabraryDeckUrl(deckUrl), [deckUrl]);
  const canStart = Boolean(parsedDeckId && practiceMode && !isImporting);

  const scrollToCreate = useCallback(() => {
    document.getElementById("create-practice")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => document.getElementById("deck-url")?.focus(), 350);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canStart) {
        setError("Paste a public Fabrary deck URL and keep Practice Mode enabled.");
        return;
      }

      setIsImporting(true);
      setError("");
      try {
        const deck = await importFabraryDeck(deckUrl);
        onStart(deck);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The deck could not be imported.");
      } finally {
        setIsImporting(false);
      }
    },
    [canStart, deckUrl, onStart],
  );

  return (
    <div className="lobby-shell">
      <header className="site-header">
        <a className="site-header__brand" href="#top" aria-label="Nimblism home">
          <Brand />
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a className="site-nav__link site-nav__link--active" href="#top">
            Play
          </a>
          <button className="site-nav__link" type="button" onClick={() => setModal("learn")}>
            Learn
          </button>
          <button className="site-nav__link" type="button" onClick={() => setModal("about")}>
            About
          </button>
        </nav>
        <button className="language-control" type="button" aria-label="Language: English">
          <GlobeIcon />
          <span>English</span>
          <ChevronIcon />
        </button>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <img className="hero__art" src="/assets/hero-arena.webp" alt="" />
          <div className="hero__content">
            <h1 id="hero-title">
              Learn Flesh &amp; Blood
              <span>by Playing</span>
            </h1>
            <p>Import a Fabrary deck, face Fai, and learn each decision with guided prompts.</p>
            <div className="hero__actions">
              <button className="button button--primary button--large" type="button" onClick={scrollToCreate}>
                Start practice
              </button>
              <button
                className="button button--outline button--large"
                type="button"
                onClick={() => setModal("learn")}
              >
                How it works
              </button>
            </div>
          </div>
        </section>

        <section className="practice-panel" id="create-practice" aria-label="Practice setup">
          <div className="sessions-pane">
            <div className="pane-heading">
              <h2>Practice Sessions</h2>
            </div>
            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon" aria-hidden="true">
                  <BookIcon />
                </div>
                <p>Your guided games will appear here.</p>
              </div>
            ) : (
              <ul className="session-list">
                {sessions.slice(0, 3).map((session) => (
                  <li key={session.id}>
                    <span className="session-list__mark" aria-hidden="true" />
                    <div>
                      <strong>{session.deckName}</strong>
                      <span>Practice vs {session.opponent}</span>
                    </div>
                    <time dateTime={session.startedAt}>
                      {new Date(session.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="create-pane">
            <h2>Create Practice</h2>
            <form onSubmit={handleSubmit} noValidate>
              <label className="field-label" htmlFor="deck-url">
                Import Deck
                <span className="field-help" title="Public Fabrary deck URL" aria-label="Public Fabrary deck URL">
                  ?
                </span>
              </label>
              <div className={`input-shell${error ? " input-shell--error" : ""}`}>
                <LinkIcon />
                <input
                  id="deck-url"
                  name="deckUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://fabrary.net/decks/…"
                  value={deckUrl}
                  onChange={(event) => {
                    setDeckUrl(event.target.value);
                    if (error) setError("");
                  }}
                  aria-describedby={error ? "deck-error" : "deck-hint"}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <p className="field-hint" id={error ? "deck-error" : "deck-hint"} role={error ? "alert" : undefined}>
                {error ||
                  (parsedDeckId
                    ? `Deck link recognized · ${parsedDeckId}`
                    : "Use a public Fabrary deck link. Private decks cannot be imported.")}
              </p>

              <label className="field-label" htmlFor="format">
                Gameplay Format
              </label>
              <div className="select-shell">
                <BookIcon />
                <select id="format" defaultValue="cc">
                  <option value="cc">Classic Constructed</option>
                </select>
                <ChevronIcon />
              </div>

              <span className="field-label">AI Deck — Fai</span>
              <div className="locked-field" aria-label="Fixed opponent: AI Deck — Fai">
                <BotIcon />
                <span>AI Deck — Fai</span>
                <span className="locked-field__status">Fixed opponent</span>
              </div>

              <div className="switch-row">
                <div>
                  <span>Practice Mode</span>
                  <small>Guided decisions and rule explanations</small>
                </div>
                <button
                  className={`switch${practiceMode ? " switch--on" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={practiceMode}
                  onClick={() => setPracticeMode((current) => !current)}
                >
                  <span />
                </button>
              </div>

              <button className="button button--primary button--full" type="submit" disabled={!canStart}>
                {isImporting ? "Preparing practice…" : "Start Practice"}
              </button>
            </form>
          </div>
        </section>
      </main>

      <LegalFooter />

      {modal === "learn" ? (
        <Modal title="How Nimblism teaches" onClose={() => setModal(null)}>
          <ol className="lesson-list">
            <li>
              <strong>Bring your deck.</strong>
              <span>Paste a public Fabrary URL. The import adapter can connect to your approved deck service.</span>
            </li>
            <li>
              <strong>Play one decision at a time.</strong>
              <span>The action panel explains priority, pitching, resources, attacks, and defense.</span>
            </li>
            <li>
              <strong>Practice without pressure.</strong>
              <span>Fai is fixed as the opponent so each lesson has a consistent pace.</span>
            </li>
          </ol>
        </Modal>
      ) : null}

      {modal === "about" ? (
        <Modal title="About Nimblism" onClose={() => setModal(null)}>
          <p>
            Nimblism is a non-commercial teaching sandbox inspired by the open-source Talishar
            interaction model. It uses original interface art and does not represent official rules
            adjudication.
          </p>
          <p>
            The local build includes a training deck fallback. Configure <code>VITE_DECK_IMPORT_API</code>{" "}
            to connect an approved server-side Fabrary importer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
