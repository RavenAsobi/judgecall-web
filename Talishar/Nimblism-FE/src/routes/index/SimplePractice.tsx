import React, { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AI_DECK, GAME_FORMAT, GAME_VISIBILITY } from 'appConstants';
import { useAppDispatch } from 'app/Hooks';
import { useCreateGameMutation } from 'features/api/apiSlice';
import { setGameStart } from 'features/game/GameSlice';
import type { CreateGameAPI } from 'interface/API/CreateGame.php';
import { toast } from 'react-hot-toast';
import styles from './SimplePractice.module.css';

const FABRARY_DECK_PATTERN =
  /^https:\/\/(?:www\.)?fabrary\.net\/decks\/[a-zA-Z0-9_-]+(?:\?.*)?$/;

const SimplePractice = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [createGame, createGameResult] = useCreateGameMutation();
  const [deckUrl, setDeckUrl] = useState('');
  const [format, setFormat] = useState(GAME_FORMAT.CLASSIC_CONSTRUCTED);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = deckUrl.trim();

    if (!FABRARY_DECK_PATTERN.test(normalizedUrl)) {
      setFieldError('Enter a public Fabrary deck URL.');
      return;
    }

    setFieldError('');

    const request: CreateGameAPI = {
      deck: '',
      fabdb: normalizedUrl,
      deckTestMode: true,
      deckTestDeck: AI_DECK.FAICC,
      format,
      visibility: GAME_VISIBILITY.PRIVATE,
      decksToTry: '',
      favoriteDeck: false,
      favoriteDecks: '',
      gameDescription: 'Practice against Fai'
    };

    try {
      const response = await createGame(request).unwrap();

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.playerID || !response.gameName || !response.authKey) {
        throw new Error('The engine returned an incomplete game session.');
      }

      dispatch(
        setGameStart({
          playerID: response.playerID,
          gameID: response.gameName,
          authKey: response.authKey
        })
      );

      navigate(`/game/lobby/${response.gameName}`, {
        state: { playerID: response.playerID }
      });
    } catch (error) {
      toast.error(String(error), { position: 'top-center' });
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.practice} aria-labelledby="practice-title">
        <h1 id="practice-title">Practice against Fai</h1>
        <p className={styles.intro}>
          Import a public Fabrary deck and open the authentic practice table.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label htmlFor="fabrary-deck">Fabrary deck</label>
          <input
            id="fabrary-deck"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://fabrary.net/decks/..."
            value={deckUrl}
            onChange={(event) => {
              setDeckUrl(event.target.value);
              if (fieldError) setFieldError('');
            }}
            aria-invalid={fieldError ? 'true' : undefined}
            aria-describedby={fieldError ? 'deck-error' : undefined}
          />
          {fieldError ? (
            <p id="deck-error" className={styles.error}>
              {fieldError}
            </p>
          ) : null}

          <label htmlFor="practice-format">Gameplay Format</label>
          <select
            id="practice-format"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value={GAME_FORMAT.CLASSIC_CONSTRUCTED}>
              Classic Constructed
            </option>
            <option value={GAME_FORMAT.BLITZ}>Blitz</option>
            <option value={GAME_FORMAT.SAGE}>Silver Age</option>
            <option value={GAME_FORMAT.LLCC}>Living Legend</option>
            <option value={GAME_FORMAT.OPEN}>Open</option>
          </select>

          <div className={styles.readOnlyField}>
            <span>AI opponent</span>
            <strong>Fai (CC)</strong>
          </div>

          <div className={styles.modeRow}>
            <span>Practice Mode</span>
            <span className={styles.switch} role="switch" aria-checked="true">
              <i />
            </span>
          </div>

          <button type="submit" disabled={createGameResult.isLoading}>
            {createGameResult.isLoading ? 'Starting...' : 'Start Practice'}
          </button>
        </form>

        <p className={styles.status}>
          <span aria-hidden="true" />
          Requires the local Nimblism engine and a Fabrary API key
        </p>
      </section>
    </main>
  );
};

export default SimplePractice;
