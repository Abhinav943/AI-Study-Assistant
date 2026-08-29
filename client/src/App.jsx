import { useState, useRef, useEffect, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./App.css";

const XP_CORRECT = 100;
const XP_STREAK_BONUS = 50;
const STREAK_THRESHOLD = 3;

const LEVELS = [
  { label: "Novice", min: 0 },
  { label: "Learner", min: 300 },
  { label: "Scholar", min: 700 },
  { label: "Expert", min: 1200 },
  { label: "Master", min: 2000 },
];

function getFriendlyErrorMessage(error) {
  const payloadMessage = error?.error?.message || error?.message;
  const message =
    typeof payloadMessage === "string" ? payloadMessage : String(error || "");

  if (!message) return "Something went wrong. Please try again.";
  if (/timed out|timeout/i.test(message))
    return "The AI took too long to respond. Please try again in a moment.";
  if (
    /malformed JSON|no usable items|invalid.*json|empty response|malformed or incomplete data/i.test(
      message,
    )
  )
    return "The AI returned incomplete or invalid content. Please try shorter notes or another prompt.";
  if (/No AI API key|API key|not configured/i.test(message))
    return "The app is not configured with an AI API key yet.";
  if (/network|fetch|failed to fetch/i.test(message))
    return "A network issue interrupted the request. Please check your connection and try again.";

  return "Something went wrong while generating your study content. Please try again.";
}

function getLevel(xp) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) lvl = l;
  const idx = LEVELS.indexOf(lvl);
  const next = LEVELS[idx + 1];
  const pct = next
    ? Math.round(((xp - lvl.min) / (next.min - lvl.min)) * 100)
    : 100;
  return { ...lvl, pct, next: next?.label ?? null };
}

function MathText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        const isBlock = part.startsWith("$$") && part.endsWith("$$");
        const isInline = !isBlock && part.startsWith("$") && part.endsWith("$");
        if (isBlock || isInline) {
          const math = part.slice(isBlock ? 2 : 1, isBlock ? -2 : -1);
          return (
            <span
              key={i}
              className={isBlock ? "math-block" : "math-inline"}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(math, {
                  displayMode: isBlock,
                  throwOnError: false,
                }),
              }}
            />
          );
        }
        return part.split("\n").map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ));
      })}
    </>
  );
}

function XpPop({ amount, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, []);
  return <div className="xp-pop">+{amount} XP</div>;
}
function HUD({ xp, streak, total, current }) {
  const lvl = getLevel(xp);
  return (
    <div className="hud">
      <div className="hud-left">
        <span className="hud-level">{lvl.label}</span>
        <div className="hud-xp-bar">
          <div className="hud-xp-fill" style={{ width: `${lvl.pct}%` }} />
        </div>
        <span className="hud-xp-num">{xp} XP</span>
      </div>

      {streak >= 2 && (
        <div className="hud-streak">
          <span className="streak-fire">🔥</span>
          <span className="streak-num">{streak}</span>
        </div>
      )}

      <div className="hud-progress">
        {current + 1} / {total}
      </div>
    </div>
  );
}

function ScoreRing({ score, total }) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const r = 50;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="score-ring-wrapper">
      <svg className="score-ring" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--violet)" />
            <stop offset="100%" stopColor="var(--amber)" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="60" cy="60" r={r} />
        <circle
          className="ring-fill"
          cx="60"
          cy="60"
          r={r}
          style={{ strokeDasharray: `${dash} ${circ}` }}
        />
      </svg>
      <div className="score-ring-text">
        <span className="score-pct">{pct}%</span>
        <span className="score-sublabel">Score</span>
      </div>
    </div>
  );
}

export default function App() {
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState("flashcard");
  const [count, setCount] = useState(5);
  const [quizType, setQuizType] = useState("single");

  const [data, setData] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flashPhase, setFlashPhase] = useState("fact");
  const [selectedFlashAnswer, setSelectedFlashAnswer] = useState("");

  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState(false);

  const [score, setScore] = useState(0);
  const [wrongItems, setWrongItems] = useState([]);
  const [correctItems, setCorrectItems] = useState([]);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showXpPop, setShowXpPop] = useState(false);
  const [xpPopAmount, setXpPopAmount] = useState(0);
  const [reviewData, setReviewData] = useState(null);

  const abortRef = useRef(null);
  const resetSession = useCallback(() => {
    setData([]);
    setCurrentIndex(0);
    setFlashPhase("fact");
    setSelectedFlashAnswer("");
    setSelectedAnswers([]);
    setTypedAnswer("");
    setShowExplanation(false);
    setIsCurrentCorrect(false);
    setScore(0);
    setWrongItems([]);
    setCorrectItems([]);
    setXp(0);
    setStreak(0);
    setMaxStreak(0);
    setReviewData(null);
  }, []);

  const resetQuizState = () => {
    setSelectedAnswers([]);
    setTypedAnswer("");
    setShowExplanation(false);
    setIsCurrentCorrect(false);
  };

  const awardXP = useCallback((correct, currentStreak) => {
    if (!correct) return;
    let gained = XP_CORRECT;
    if (currentStreak >= STREAK_THRESHOLD) gained += XP_STREAK_BONUS;
    setXp((prev) => prev + gained);
    setXpPopAmount(gained);
    setShowXpPop(true);
  }, []);

  const generateContent = async () => {
    if (!notes.trim()) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    resetSession();
    setErrorMessage("");
    setStatus("loading");

    try {
      const res = await fetch("http://localhost:3000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, mode, count, quizType }),
        signal: abortRef.current.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw {
          message: json?.error?.message || "Failed to generate.",
          error: json?.error,
        };
      }
      const items = Array.isArray(json.data) ? json.data : [];
      if (!items.length)
        throw new Error("AI returned no items. Please try again.");
      setData(items);
      setStatus("studying");
    } catch (e) {
      if (e.name === "AbortError") return;
      setErrorMessage(getFriendlyErrorMessage(e));
      setStatus("error");
    }
  };

  const moveToNext = (correct) => {
    const item = data[currentIndex];
    const newStreak = correct ? streak + 1 : 0;
    setStreak(newStreak);
    setMaxStreak((prev) => Math.max(prev, newStreak));

    if (correct) {
      setScore((prev) => prev + 1);
      setCorrectItems((prev) => [...prev, item]);
    } else {
      setWrongItems((prev) => [...prev, item]);
    }
    awardXP(correct, newStreak);

    if (currentIndex < data.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setFlashPhase("fact");
      setSelectedFlashAnswer("");
      resetQuizState();
    } else {
      setStatus("summary");
    }
  };

  const handleFlashAnswer = (option) => {
    if (flashPhase === "result") return;
    setSelectedFlashAnswer(option);
    setFlashPhase("result");
    setIsCurrentCorrect(option === data[currentIndex].answer);
  };

  const checkQuizAnswer = () => {
    const q = data[currentIndex];
    let correct = false;
    if (q.type === "single") {
      correct =
        selectedAnswers.length === 1 &&
        q.correctAnswers.includes(selectedAnswers[0]);
    } else if (q.type === "multi") {
      const allOk = selectedAnswers.every((a) => q.correctAnswers.includes(a));
      const allSel = q.correctAnswers.every((a) => selectedAnswers.includes(a));
      correct = allOk && allSel;
    } else {
      correct = q.correctAnswers.some(
        (a) => a.trim().toLowerCase() === typedAnswer.trim().toLowerCase(),
      );
    }
    setIsCurrentCorrect(correct);
    setShowExplanation(true);
    const newStreak = correct ? streak + 1 : 0;
    setStreak(newStreak);
    setMaxStreak((prev) => Math.max(prev, newStreak));
    if (correct) {
      setScore((prev) => prev + 1);
      setCorrectItems((prev) => [...prev, data[currentIndex]]);
    } else {
      setWrongItems((prev) => [...prev, data[currentIndex]]);
    }
    awardXP(correct, newStreak);
  };

  const advanceAfterQuiz = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      resetQuizState();
    } else {
      setStatus("summary");
    }
  };

  const fetchReview = async () => {
    setStatus("reviewing");
    setErrorMessage("");
    try {
      const res = await fetch("http://localhost:3000/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: data.length,
          score,
          wrongItems,
          correctItems,
          mode,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw {
          message: json?.error?.message || "Review generation failed.",
          error: json?.error,
        };
      }
      setReviewData(json.review);
      setStatus("review");
    } catch (e) {
      setErrorMessage(getFriendlyErrorMessage(e));
      setStatus("summary");
    }
  };

  const startOver = () => {
    resetSession();
    setNotes("");
    setStatus("idle");
  };

  const currentItem = data[currentIndex];

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-row">
          <span className="logo-mark">◈</span>
          <h1 className="app-title">Study Assistant</h1>
        </div>
        <p className="app-sub">
          AI-powered flashcards & quizzes from your notes
        </p>
      </header>

      <main className="glass-panel main-panel">
        {["idle", "loading", "error"].includes(status) && (
          <div className="input-section">
            <label className="field-label" htmlFor="notes">
              Your Notes
            </label>
            <textarea
              id="notes"
              className="notes-input"
              placeholder="Paste lecture notes, a textbook excerpt, or any topic..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={status === "loading"}
            />

            <div className="config-grid">
              <div className="config-item">
                <label htmlFor="mode-sel">Mode</label>
                <select
                  id="mode-sel"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="flashcard">Flashcards</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
              <div className="config-item">
                <label htmlFor="count-inp">Count</label>
                <input
                  id="count-inp"
                  type="number"
                  min="1"
                  max="20"
                  value={count}
                  onChange={(e) => setCount(+e.target.value)}
                />
              </div>
              {mode === "quiz" && (
                <div className="config-item">
                  <label htmlFor="qtype-sel">Question Type</label>
                  <select
                    id="qtype-sel"
                    value={quizType}
                    onChange={(e) => setQuizType(e.target.value)}
                  >
                    <option value="single">Single Choice</option>
                    <option value="multi">Multiple Choice</option>
                    <option value="typed">Written Answer</option>
                  </select>
                </div>
              )}
            </div>

            {status === "error" && (
              <div className="error-banner" role="alert">
                <span className="error-icon" aria-hidden="true">
                  ⚠
                </span>
                <div className="error-content">
                  <strong>Something went wrong</strong>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            <button
              id="generate-btn"
              className="btn btn-primary"
              onClick={generateContent}
              disabled={status === "loading" || !notes.trim()}
            >
              {status === "loading" ? (
                <span className="spinner-row">
                  <span className="spinner" /> Generating…
                </span>
              ) : (
                "Generate"
              )}
            </button>
          </div>
        )}

        {status === "studying" && mode === "flashcard" && currentItem && (
          <div className="study-section">
            {showXpPop && (
              <XpPop amount={xpPopAmount} onDone={() => setShowXpPop(false)} />
            )}
            <HUD
              xp={xp}
              streak={streak}
              total={data.length}
              current={currentIndex}
            />

            <div
              className={`flashcard ${flashPhase !== "fact" ? "flipped" : ""}`}
              onClick={() => flashPhase === "fact" && setFlashPhase("question")}
            >
              <div className="flashcard-inner">
                <div className="flashcard-face flashcard-front glass-panel">
                  <span className="face-tag">Concept</span>
                  <div className="card-body">
                    <MathText text={currentItem.fact} />
                  </div>
                  <span className="flip-hint">Click to test yourself →</span>
                </div>

                <div className="flashcard-face flashcard-back glass-panel">
                  <span className="face-tag accent-tag">Quick Check</span>
                  <p className="card-question">
                    <MathText text={currentItem.question} />
                  </p>

                  <div className="options-grid">
                    {currentItem.options.map((opt, i) => {
                      let cls = "opt-btn";
                      if (flashPhase === "result") {
                        if (opt === currentItem.answer) cls += " opt-correct";
                        else if (opt === selectedFlashAnswer)
                          cls += " opt-wrong";
                        else cls += " opt-dim";
                      } else if (selectedFlashAnswer === opt) {
                        cls += " opt-selected";
                      }
                      return (
                        <button
                          key={i}
                          id={`flash-opt-${i}`}
                          className={cls}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFlashAnswer(opt);
                          }}
                          disabled={flashPhase === "result"}
                        >
                          <span className="opt-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <MathText text={opt} />
                        </button>
                      );
                    })}
                  </div>

                  {flashPhase === "result" && (
                    <div
                      className={`inline-explanation ${isCurrentCorrect ? "exp-correct" : "exp-wrong"}`}
                    >
                      <span className="result-chip">
                        {isCurrentCorrect ? "✓ Correct" : "✕ Incorrect"}
                      </span>
                      <p className="exp-text">
                        <MathText text={currentItem.explanation} />
                      </p>
                      <button
                        id="flash-next-btn"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveToNext(isCurrentCorrect);
                        }}
                      >
                        {currentIndex < data.length - 1
                          ? "Next Card →"
                          : "View Results"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {status === "studying" && mode === "quiz" && currentItem && (
          <div className="study-section">
            {showXpPop && (
              <XpPop amount={xpPopAmount} onDone={() => setShowXpPop(false)} />
            )}
            <HUD
              xp={xp}
              streak={streak}
              total={data.length}
              current={currentIndex}
            />

            <div className="quiz-card glass-panel">
              <p className="quiz-question">
                <MathText text={currentItem.question} />
              </p>

              <div className="options-list">
                {currentItem.type === "single" &&
                  currentItem.options.map((opt, i) => {
                    let cls = "opt-btn opt-wide";
                    if (showExplanation) {
                      if (currentItem.correctAnswers.includes(opt))
                        cls += " opt-correct";
                      else if (selectedAnswers.includes(opt))
                        cls += " opt-wrong";
                      else cls += " opt-dim";
                    } else if (selectedAnswers.includes(opt))
                      cls += " opt-selected";
                    return (
                      <button
                        key={i}
                        id={`q-opt-${i}`}
                        className={cls}
                        onClick={() => setSelectedAnswers([opt])}
                        disabled={showExplanation}
                      >
                        <span className="opt-letter">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <MathText text={opt} />
                      </button>
                    );
                  })}

                {currentItem.type === "multi" &&
                  currentItem.options.map((opt, i) => {
                    let cls = "opt-btn opt-wide opt-multi";
                    if (showExplanation) {
                      if (currentItem.correctAnswers.includes(opt))
                        cls += " opt-correct";
                      else if (selectedAnswers.includes(opt))
                        cls += " opt-wrong";
                      else cls += " opt-dim";
                    } else if (selectedAnswers.includes(opt))
                      cls += " opt-selected opt-multi-sel";
                    return (
                      <button
                        key={i}
                        id={`q-opt-${i}`}
                        className={cls}
                        onClick={() =>
                          setSelectedAnswers((prev) =>
                            prev.includes(opt)
                              ? prev.filter((a) => a !== opt)
                              : [...prev, opt],
                          )
                        }
                        disabled={showExplanation}
                      >
                        <span className="opt-letter">
                          {selectedAnswers.includes(opt) ? "■" : "□"}
                        </span>
                        <MathText text={opt} />
                      </button>
                    );
                  })}

                {currentItem.type === "typed" && (
                  <input
                    id="typed-ans"
                    className="typed-input"
                    type="text"
                    placeholder="Type your answer…"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !showExplanation &&
                      typedAnswer.trim() &&
                      checkQuizAnswer()
                    }
                    disabled={showExplanation}
                  />
                )}
              </div>
            </div>

            {!showExplanation ? (
              <button
                id="submit-btn"
                className="btn btn-primary"
                onClick={checkQuizAnswer}
                disabled={
                  (currentItem.type !== "typed" && !selectedAnswers.length) ||
                  (currentItem.type === "typed" && !typedAnswer.trim())
                }
              >
                Submit Answer
              </button>
            ) : (
              <div
                className={`explanation-panel glass-panel ${isCurrentCorrect ? "exp-correct" : "exp-wrong"}`}
              >
                <div className="exp-header">
                  <span
                    className={`result-chip ${isCurrentCorrect ? "chip-ok" : "chip-err"}`}
                  >
                    {isCurrentCorrect ? "✓ Correct" : "✕ Incorrect"}
                  </span>
                  {!isCurrentCorrect && (
                    <p className="correct-answer-line">
                      <strong>Correct:</strong>{" "}
                      {currentItem.correctAnswers.join(" / ")}
                    </p>
                  )}
                </div>
                <div className="exp-body">
                  <MathText text={currentItem.explanation} />
                </div>
                <button
                  id="next-btn"
                  className="btn btn-primary btn-sm"
                  onClick={advanceAfterQuiz}
                >
                  {currentIndex < data.length - 1
                    ? "Next Question →"
                    : "View Results"}
                </button>
              </div>
            )}
          </div>
        )}

        {status === "summary" && (
          <div className="summary-section">
            <h2 className="summary-title">Session Complete</h2>

            <ScoreRing score={score} total={data.length} />

            <div className="stats-row">
              <div className="stat-block">
                <span className="stat-val">{data.length}</span>
                <span className="stat-desc">Total</span>
              </div>
              <div className="stat-block stat-ok">
                <span className="stat-val">{score}</span>
                <span className="stat-desc">Correct</span>
              </div>
              <div className="stat-block stat-err">
                <span className="stat-val">{wrongItems.length}</span>
                <span className="stat-desc">Review</span>
              </div>
              <div className="stat-block stat-xp">
                <span className="stat-val">{xp}</span>
                <span className="stat-desc">XP</span>
              </div>
            </div>

            {maxStreak >= 3 && (
              <div className="streak-banner">
                🔥 Best streak: {maxStreak} in a row!
              </div>
            )}

            <div className="summary-actions">
              <button
                id="review-btn"
                className="btn btn-primary"
                onClick={fetchReview}
              >
                Get Performance Review
              </button>
              {wrongItems.length > 0 && (
                <button
                  id="retry-btn"
                  className="btn btn-secondary"
                  onClick={() => {
                    setData(wrongItems);
                    setCurrentIndex(0);
                    setFlashPhase("fact");
                    setSelectedFlashAnswer("");
                    setWrongItems([]);
                    setCorrectItems([]);
                    setScore(0);
                    setStreak(0);
                    resetQuizState();
                    setStatus("studying");
                  }}
                >
                  Re-test Missed Items
                </button>
              )}
              <button
                id="start-over-btn"
                className="btn btn-ghost"
                onClick={startOver}
              >
                Start New Session
              </button>
            </div>
          </div>
        )}

        {status === "reviewing" && (
          <div className="reviewing-screen">
            <div className="spinner large-spinner" />
            <p>Analysing your performance…</p>
          </div>
        )}

        {status === "review" && reviewData && (
          <div className="review-section">
            <div className="review-header">
              <span className={`grade-badge grade-${reviewData.grade}`}>
                {reviewData.grade}
              </span>
              <h2 className="review-headline">{reviewData.headline}</h2>
              <p className="review-overall">{reviewData.overall}</p>
            </div>

            <div className="review-grid">
              <div className="review-card glass-panel">
                <h3 className="review-card-title ok-title">✓ Strengths</h3>
                <ul>
                  {reviewData.strengths?.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="review-card glass-panel">
                <h3 className="review-card-title err-title">
                  △ Areas to Improve
                </h3>
                <ul>
                  {reviewData.weaknesses?.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="review-suggestions glass-panel">
              <h3 className="review-card-title">📚 Suggested Next Steps</h3>
              <ol>
                {reviewData.suggestions?.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>

            <div className="review-encouragement">
              <span className="enc-icon">💡</span>
              <p>{reviewData.encouragement}</p>
            </div>

            <div className="summary-actions">
              {wrongItems.length > 0 && (
                <button
                  id="retry-from-review-btn"
                  className="btn btn-primary"
                  onClick={() => {
                    setData(wrongItems);
                    setCurrentIndex(0);
                    setFlashPhase("fact");
                    setSelectedFlashAnswer("");
                    setWrongItems([]);
                    setCorrectItems([]);
                    setScore(0);
                    setStreak(0);
                    resetQuizState();
                    setStatus("studying");
                  }}
                >
                  Re-test Missed Items
                </button>
              )}
              <button
                id="new-session-btn"
                className="btn btn-ghost"
                onClick={startOver}
              >
                Start New Session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
