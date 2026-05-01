const WORDS_TO_FINISH = 10;
const DRIVE_SECONDS = 120;
const GAME_SECONDS = 300;
const LEADERBOARD_KEY = "dirtBikeGrammarLeaderboard";
const BIKE_SAVE_KEY = "dirtBikeGrammarBikeUpgrades";
const BIKE_COLORS = {
  red: { label: "Red", value: "#c8493d", cost: 0 },
  blue: { label: "Blue", value: "#2369a8", cost: 10 },
  green: { label: "Green", value: "#2f7d55", cost: 10 },
  yellow: { label: "Yellow", value: "#d99b2b", cost: 10 },
  orange: { label: "Orange", value: "#e8772e", cost: 10 }
};

const grammarBank = {
  noun: [
    "animal", "artist", "author", "beach", "building", "chapter",
    "city", "classroom", "cloud", "country", "doctor", "family",
    "farmer", "forest", "friend", "garden", "history", "island",
    "journey", "kitchen", "library", "machine", "market", "mountain",
    "museum", "neighbor", "ocean", "pencil", "planet", "problem",
    "river", "school", "science", "season", "teacher", "village",
    "weather", "window", "writer", "zoo"
  ],
  verb: [
    "build", "carry", "choose", "compare", "create", "describe",
    "discover", "explain", "follow", "gather", "imagine", "listen",
    "measure", "notice", "observe", "organize", "prepare", "protect",
    "remember", "repair", "share", "solve", "travel", "write",
    "climb", "collect", "deliver", "explore", "float", "include",
    "invent", "join", "locate", "mix", "search", "whisper"
  ],
  adjective: [
    "brave", "bright", "careful", "clear", "cloudy", "cold",
    "colorful", "curious", "early", "empty", "famous", "friendly",
    "gentle", "happy", "helpful", "honest", "large", "late",
    "loud", "narrow", "quiet", "rough", "shiny", "simple",
    "small", "smooth", "strong", "sunny", "tall", "thankful",
    "useful", "warm", "wide", "wild", "young"
  ]
};

const state = {
  mode: "words",
  vocabScore: 0,
  rideScore: 0,
  kcsBalance: 0,
  ownedColors: ["red"],
  selectedBikeColor: "red",
  tokensCollected: 0,
  roundCorrect: 0,
  questionCursor: 0,
  roundQuestions: [],
  currentQuestion: null,
  usedGrammarPrompts: new Set(),
  gameRemaining: GAME_SECONDS,
  gameTimer: null,
  gameOver: false,
  driveRemaining: DRIVE_SECONDS,
  driveTimer: null,
  animationFrame: null,
  lastFrame: 0,
  keys: new Set(),
  bike: {
    x: 140,
    y: 250,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    lane: 0,
    laneTarget: 0,
    laneVelocity: 0,
    worldSpeed: 0,
    wheelSpin: 0,
    suspension: 0,
    tilt: 0,
    boost: 1
  },
  obstacles: [],
  ramps: [],
  tokens: [],
  dust: [],
  sparks: [],
  feedbackText: "",
  feedbackTimer: 0,
  worldScroll: 0,
  visualScroll: 0
};

const els = {
  bike: document.querySelector("#bike"),
  modeLabel: document.querySelector("#modeLabel"),
  scoreLabel: document.querySelector("#scoreLabel"),
  timerLabel: document.querySelector("#timerLabel"),
  titleScreen: document.querySelector("#titleScreen"),
  gameContent: document.querySelector("#gameContent"),
  playButton: document.querySelector("#playButton"),
  wordProgressText: document.querySelector("#wordProgressText"),
  wordMeter: document.querySelector("#wordMeter"),
  wordGrid: document.querySelector("#wordGrid"),
  definitionCard: document.querySelector("#definitionCard"),
  message: document.querySelector("#message"),
  wordMode: document.querySelector("#wordMode"),
  driveMode: document.querySelector("#driveMode"),
  canvas: document.querySelector("#driveCanvas"),
  endRideButton: document.querySelector("#endRideButton"),
  leaderboardList: document.querySelector("#leaderboardList"),
  titleLeaderboardList: document.querySelector("#titleLeaderboardList"),
  gameOverModal: document.querySelector("#gameOverModal"),
  finalScoreText: document.querySelector("#finalScoreText"),
  playerNameInput: document.querySelector("#playerNameInput"),
  saveScoreButton: document.querySelector("#saveScoreButton"),
  resetGameButton: document.querySelector("#resetGameButton"),
  kcsBalanceLabel: document.querySelector("#kcsBalanceLabel"),
  colorShop: document.querySelector("#colorShop")
};

const ctx = els.canvas.getContext("2d");

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allGrammarQuestions() {
  return Object.entries(grammarBank).flatMap(([part, words]) =>
    words.map((word) => ({
      part,
      word,
      prompt: `Select the ${part}.`,
      id: `${part}:${word}`
    }))
  );
}

function pickQuestions(count) {
  let available = allGrammarQuestions()
    .filter((question) => !state.usedGrammarPrompts.has(question.id));

  if (available.length < count) {
    state.usedGrammarPrompts.clear();
    available = allGrammarQuestions();
  }

  const picked = shuffle(available).slice(0, count);
  picked.forEach((question) => state.usedGrammarPrompts.add(question.id));
  return picked;
}

function makeGrammarChoices(question) {
  const choices = [{ word: question.word, part: question.part }];
  const distractorParts = Object.keys(grammarBank).filter((part) => part !== question.part);
  const distractorWords = [];

  while (distractorWords.length < 3) {
    const part = shuffle(distractorParts)[0];
    const word = shuffle(grammarBank[part])[0];
    if (word !== question.word && !distractorWords.some((item) => item.word === word)) {
      distractorWords.push({ word, part });
    }
  }

  return shuffle([...choices, ...distractorWords]);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function totalScore() {
  return state.vocabScore + state.rideScore;
}

function currentBikeColor() {
  return BIKE_COLORS[state.selectedBikeColor]?.value || BIKE_COLORS.red.value;
}

function loadBikeUpgrades() {
  try {
    const saved = JSON.parse(localStorage.getItem(BIKE_SAVE_KEY)) || {};
    state.kcsBalance = Number(saved.kcsBalance) || 0;
    state.ownedColors = Array.isArray(saved.ownedColors) && saved.ownedColors.length
      ? saved.ownedColors.filter((color) => BIKE_COLORS[color])
      : ["red"];
    if (!state.ownedColors.includes("red")) {
      state.ownedColors.unshift("red");
    }
    state.selectedBikeColor = BIKE_COLORS[saved.selectedBikeColor] && state.ownedColors.includes(saved.selectedBikeColor)
      ? saved.selectedBikeColor
      : "red";
  } catch {
    state.kcsBalance = 0;
    state.ownedColors = ["red"];
    state.selectedBikeColor = "red";
  }
}

function saveBikeUpgrades() {
  localStorage.setItem(BIKE_SAVE_KEY, JSON.stringify({
    kcsBalance: state.kcsBalance,
    ownedColors: state.ownedColors,
    selectedBikeColor: state.selectedBikeColor
  }));
}

function applyBikeColor() {
  document.documentElement.style.setProperty("--bike-color", currentBikeColor());
}

function renderUpgradeShop() {
  if (!els.colorShop || !els.kcsBalanceLabel) {
    return;
  }

  els.kcsBalanceLabel.textContent = `KCS: ${state.kcsBalance}`;
  els.colorShop.innerHTML = "";

  Object.entries(BIKE_COLORS)
    .filter(([color]) => color !== "red")
    .forEach(([color, details]) => {
      const owned = state.ownedColors.includes(color);
      const selected = state.selectedBikeColor === color;
      const canBuy = state.kcsBalance >= details.cost;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `color-button${owned ? " owned" : ""}${selected ? " selected" : ""}`;
      button.disabled = !owned && !canBuy;
      button.innerHTML = `
        <span class="color-swatch" style="background:${details.value}"></span>
        ${details.label}
        <span class="color-cost">${selected ? "Selected" : owned ? "Owned" : `${details.cost} KCS`}</span>
      `;
      button.addEventListener("click", () => {
        if (!owned) {
          if (state.kcsBalance < details.cost) {
            return;
          }
          state.kcsBalance -= details.cost;
          state.ownedColors.push(color);
        }
        state.selectedBikeColor = color;
        applyBikeColor();
        saveBikeUpgrades();
        renderUpgradeShop();
      });
      els.colorShop.append(button);
    });
}

function updateHud() {
  els.modeLabel.textContent = state.mode === "words" ? "Grammar Race" : "Free Ride";
  els.scoreLabel.textContent = `${totalScore()} pts`;
  els.timerLabel.textContent = formatTime(state.gameRemaining);
  els.wordProgressText.textContent = `${state.roundCorrect} / ${WORDS_TO_FINISH}`;
  els.wordMeter.style.width = `${(state.roundCorrect / WORDS_TO_FINISH) * 100}%`;
  els.bike.style.setProperty("--bike-left", `${4 + (state.roundCorrect / WORDS_TO_FINISH) * 80}%`);
}

function startGameTimer() {
  window.clearInterval(state.gameTimer);
  if (state.gameOver || state.mode !== "words" || state.gameRemaining <= 0) {
    return;
  }

  state.gameTimer = window.setInterval(() => {
    state.gameRemaining -= 1;
    updateHud();
    if (state.gameRemaining <= 0) {
      endGame();
    }
  }, 1000);
}

function pauseGameTimer() {
  window.clearInterval(state.gameTimer);
  state.gameTimer = null;
}

function loadLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 10)));
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  const lists = [els.leaderboardList, els.titleLeaderboardList].filter(Boolean);
  lists.forEach((list) => {
    list.innerHTML = "";
  });

  if (entries.length === 0) {
    lists.forEach((list) => {
      const empty = document.createElement("li");
      empty.textContent = "No scores yet";
      list.append(empty);
    });
    return;
  }

  entries.slice(0, 5).forEach((entry) => {
    lists.forEach((list) => {
      const item = document.createElement("li");
      item.textContent = entry.name;
      const score = document.createElement("span");
      score.textContent = `${entry.score} pts`;
      item.append(score);
      list.append(item);
    });
  });
}

function showTitleScreen() {
  pauseGameTimer();
  window.clearInterval(state.driveTimer);
  window.cancelAnimationFrame(state.animationFrame);
  state.keys.clear();
  els.titleScreen.hidden = false;
  els.gameContent.hidden = true;
  els.gameOverModal.hidden = true;
  renderLeaderboard();
}

function endGame() {
  state.gameOver = true;
  state.gameRemaining = 0;
  pauseGameTimer();
  window.clearInterval(state.driveTimer);
  window.cancelAnimationFrame(state.animationFrame);
  state.keys.clear();
  els.wordGrid.innerHTML = "";
  els.wordMode.hidden = false;
  els.driveMode.hidden = true;
  els.definitionCard.classList.add("correction-card");
  els.definitionCard.innerHTML = "<span>Time's Up</span>Game over. Add your score to the leaderboard.";
  els.message.textContent = "";
  els.finalScoreText.textContent = `Score: ${totalScore()} pts`;
  els.gameOverModal.hidden = false;
  els.playerNameInput.focus();
  updateHud();
}

function saveCurrentScore() {
  const name = els.playerNameInput.value.trim().slice(0, 12) || "Player";
  const entries = loadLeaderboard();
  entries.push({
    name,
    score: totalScore(),
    date: new Date().toISOString()
  });
  entries.sort((a, b) => b.score - a.score);
  saveLeaderboard(entries);
  renderLeaderboard();
  els.gameOverModal.hidden = true;
  showTitleScreen();
}

function resetGame() {
  pauseGameTimer();
  window.clearInterval(state.driveTimer);
  window.cancelAnimationFrame(state.animationFrame);
  els.titleScreen.hidden = true;
  els.gameContent.hidden = false;
  state.mode = "words";
  state.vocabScore = 0;
  state.rideScore = 0;
  state.tokensCollected = 0;
  state.roundCorrect = 0;
  state.questionCursor = 0;
  state.roundQuestions = [];
  state.currentQuestion = null;
  state.usedGrammarPrompts.clear();
  state.gameRemaining = GAME_SECONDS;
  state.driveRemaining = DRIVE_SECONDS;
  state.tokensCollected = 0;
  state.gameOver = false;
  state.keys.clear();
  els.gameOverModal.hidden = true;
  startWordMode();
  updateHud();
}

function startDefinitionRound() {
  state.roundQuestions = pickQuestions(60);
  state.roundCorrect = 0;
  state.questionCursor = 0;
  showNextQuestion();
}

function showNextQuestion() {
  if (state.gameOver) {
    return;
  }

  els.wordGrid.innerHTML = "";
  els.definitionCard.classList.remove("correction-card");
  els.message.textContent = "Read the prompt, then choose the matching word.";

  if (state.roundCorrect >= WORDS_TO_FINISH) {
    els.definitionCard.innerHTML = "<span>Finish Line</span>All 10 grammar questions answered.";
    els.message.textContent = "Finish line reached. Free ride unlocked.";
    window.setTimeout(startDriveMode, 700);
    return;
  }

  if (state.questionCursor >= state.roundQuestions.length) {
    state.roundQuestions.push(...pickQuestions(30));
  }

  state.currentQuestion = state.roundQuestions[state.questionCursor];
  const choices = makeGrammarChoices(state.currentQuestion);

  els.definitionCard.innerHTML = `<span>Correct ${state.roundCorrect} of ${WORDS_TO_FINISH}</span>${state.currentQuestion.prompt}`;
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "word-button";
    button.textContent = choice.word;
    button.addEventListener("click", () => handleWordClick(button, choice));
    els.wordGrid.append(button);
  });
}

function showCorrectionCard(kind, question) {
  const label = kind === "correct" ? "Correct" : "Error Correction";
  els.definitionCard.classList.add("correction-card");
  els.definitionCard.innerHTML = `<span>${label}</span>The ${question.part} below is "${question.word}".`;
  els.message.textContent = "";
}

function bumpBike() {
  els.bike.classList.add("bump");
  els.bike.classList.add("riding");
  window.setTimeout(() => {
    els.bike.classList.remove("bump");
    els.bike.classList.remove("riding");
  }, 680);
}

function handleWordClick(button, choice) {
  if (state.mode !== "words" || state.gameOver || button.disabled) {
    return;
  }

  const isTarget = choice.word === state.currentQuestion.word;
  [...els.wordGrid.children].forEach((choice) => {
    choice.disabled = true;
    if (choice.textContent === state.currentQuestion.word) {
      choice.classList.add("correct");
    }
  });

  if (isTarget) {
    state.roundCorrect += 1;
    state.questionCursor += 1;
    state.vocabScore += 10;
    showCorrectionCard("correct", state.currentQuestion);
    bumpBike();
    updateHud();
    window.setTimeout(showNextQuestion, 850);
  } else {
    button.classList.add("wrong");
    state.questionCursor += 1;
    showCorrectionCard("error", state.currentQuestion);
    updateHud();
    window.setTimeout(showNextQuestion, 1600);
  }
}

function startWordMode() {
  if (state.gameOver) {
    return;
  }

  state.mode = "words";
  state.driveRemaining = DRIVE_SECONDS;
  state.keys.clear();
  window.clearInterval(state.driveTimer);
  window.cancelAnimationFrame(state.animationFrame);
  els.wordMode.hidden = false;
  els.driveMode.hidden = true;
  els.message.textContent = "Read the part of speech, then choose the matching 4th grade vocabulary word.";
  startDefinitionRound();
  updateHud();
  startGameTimer();
}

function startDriveMode() {
  if (state.gameOver) {
    return;
  }

  pauseGameTimer();
  state.mode = "drive";
  state.driveRemaining = DRIVE_SECONDS;
  state.bike = {
    x: 150,
    y: 250,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    lane: 0,
    laneTarget: 0,
    laneVelocity: 0,
    worldSpeed: 0,
    wheelSpin: 0,
    suspension: 0,
    tilt: 0,
    boost: 1
  };
  state.worldScroll = 0;
  state.visualScroll = 0;
  state.obstacles = createObstacles();
  state.ramps = createRamps();
  state.tokens = createTokens();
  state.dust = [];
  state.sparks = [];
  state.feedbackText = "";
  state.feedbackTimer = 0;
  els.wordMode.hidden = true;
  els.driveMode.hidden = false;
  updateHud();

  window.clearInterval(state.driveTimer);
  state.driveTimer = window.setInterval(() => {
    state.driveRemaining -= 1;
    updateHud();
    if (state.driveRemaining <= 0) {
      startWordMode();
    }
  }, 1000);

  state.lastFrame = performance.now();
  state.animationFrame = window.requestAnimationFrame(drawDriveFrame);
}

function createObstacles() {
  return Array.from({ length: 3 }, (_, index) => ({
    x: 960 + index * 900 + Math.random() * 180,
    lane: -28 + Math.random() * 56,
    w: 58,
    h: 46,
    cleared: false
  }));
}

function createRamps() {
  return state.obstacles.map((obstacle) => ({
    x: obstacle.x - 185,
    lane: obstacle.lane,
    w: 92,
    h: 42,
    hit: false
  }));
}

function createTokens() {
  return Array.from({ length: 4 }, (_, index) => makeToken(760 + index * 620 + Math.random() * 220));
}

function makeToken(x) {
  const lane = -48 + Math.random() * 96;
  return {
    x,
    lane,
    yOffset: Math.random() < 0.32 ? -78 : -34,
    collected: false,
    spin: Math.random() * Math.PI * 2
  };
}

function resizeCanvasForDisplay() {
  const rect = els.canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(640, Math.floor(rect.width * scale));
  const height = Math.max(280, Math.floor(rect.height * scale));

  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { width: rect.width, height: rect.height };
}

function getCanvasDisplaySize() {
  return {
    width: els.canvas.clientWidth || 960,
    height: els.canvas.clientHeight || 420
  };
}

function roadSurfaceY(x, lane = 0, width, height) {
  const display = width && height ? { width, height } : getCanvasDisplaySize();
  const base = display.height * 0.7;
  const scroll = state.visualScroll || state.worldScroll;
  const rolling = Math.sin((x + scroll) * 0.008) * 6;
  const chatter = Math.sin((x + scroll) * 0.018) * 1.5;
  return base + lane + rolling + chatter;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawDriveFrame(now) {
  if (state.mode !== "drive") {
    return;
  }

  const dt = Math.min(0.035, (now - state.lastFrame) / 1000);
  state.lastFrame = now;

  updateBikePhysics(dt);
  drawDriveScene();
  state.animationFrame = window.requestAnimationFrame(drawDriveFrame);
}

function updateBikePhysics(dt) {
  const bike = state.bike;
  const up = state.keys.has("arrowup") || state.keys.has("w");
  const down = state.keys.has("arrowdown") || state.keys.has("s");
  const left = state.keys.has("arrowleft") || state.keys.has("a");
  const right = state.keys.has("arrowright") || state.keys.has("d");
  const boost = state.keys.has(" ");

  const acceleration = boost ? 880 : 560;
  const maxSpeed = boost ? 520 : 400;
  const grounded = bike.z === 0;

  if (right) bike.worldSpeed += acceleration * dt;
  if (left) bike.worldSpeed -= acceleration * 1.05 * dt;
  if (up) bike.laneVelocity -= 520 * dt;
  if (down) bike.laneVelocity += 520 * dt;
  bike.laneVelocity *= grounded ? 0.86 : 0.94;
  bike.laneTarget += bike.laneVelocity * dt;
  bike.laneTarget = clamp(bike.laneTarget, -58, 58);
  if (!up && !down) {
    bike.laneTarget *= 0.99;
  }
  bike.lane += (bike.laneTarget - bike.lane) * Math.min(1, (grounded ? 6.5 : 4.2) * dt);

  if (!right && !left) {
    bike.worldSpeed -= Math.sign(bike.worldSpeed) * Math.min(Math.abs(bike.worldSpeed), 120 * dt);
  }

  bike.worldSpeed = clamp(bike.worldSpeed, 0, maxSpeed);
  bike.vx += ((150 + bike.worldSpeed * 0.12) - bike.x) * 5.5 * dt;

  bike.vz -= 760 * dt;
  bike.z += bike.vz * dt;
  if (bike.z <= 0) {
    if (bike.vz < -240) {
      makeLandingDust();
    }
    bike.z = 0;
    bike.vz = 0;
  }

  bike.vx *= 0.88;
  bike.vy *= 0.78;
  bike.vx = clamp(bike.vx, -160, 160);
  bike.vy = clamp(bike.vy, -260, 260);
  bike.x += bike.vx * dt;
  bike.wheelSpin += (bike.worldSpeed * 0.08 + Math.abs(bike.vx) * 0.04) * dt;
  bike.suspension = Math.sin(performance.now() / 55) * Math.min(6, bike.worldSpeed / 85);
  bike.tilt += (((bike.z > 0 ? -bike.vz / 900 : 0) + bike.laneVelocity / 900) - bike.tilt) * Math.min(1, 6 * dt);
  state.worldScroll += bike.worldSpeed * dt;
  state.visualScroll += (state.worldScroll - state.visualScroll) * Math.min(1, 7 * dt);

  bike.x = clamp(bike.x, 82, els.canvas.clientWidth * 0.38);
  bike.y = roadSurfaceY(bike.x, bike.lane) - 46;

  state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
  if (state.feedbackTimer === 0) {
    state.feedbackText = "";
  }

  if (bike.worldSpeed + Math.abs(bike.vy) > 90 && bike.z < 8) {
    state.dust.push({
      x: bike.x - 48,
      y: roadSurfaceY(bike.x, bike.lane) - 6,
      life: 0.5,
      r: 4 + Math.random() * 7,
      vx: -55 - bike.worldSpeed * 0.12
    });
  }

  state.dust.forEach((puff) => {
    puff.life -= dt;
    puff.x += (puff.vx || -42) * dt;
    puff.y += 12 * dt;
  });
  state.dust = state.dust.filter((puff) => puff.life > 0);

  state.sparks.forEach((spark) => {
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 260 * dt;
  });
  state.sparks = state.sparks.filter((spark) => spark.life > 0);

  state.tokens.forEach((token) => {
    token.x -= (145 + bike.worldSpeed) * dt;
    token.spin += (4 + bike.worldSpeed / 130) * dt;

    if (token.x < -80 || token.collected) {
      Object.assign(token, makeToken(els.canvas.clientWidth + 520 + Math.random() * 760));
    }

    const tokenY = roadSurfaceY(token.x, token.lane) + token.yOffset;
    const bikeCenterX = bike.x + 8;
    const bikeCenterY = bike.y + 4 - bike.z;
    const hitX = Math.abs(bikeCenterX - token.x) < 46;
    const hitY = Math.abs(bikeCenterY - tokenY) < 50;
    if (hitX && hitY) {
      token.collected = true;
      state.rideScore += 5;
      state.tokensCollected += 1;
      state.kcsBalance += 1;
      state.feedbackText = "KCS +5";
      state.feedbackTimer = 0.9;
      saveBikeUpgrades();
      renderUpgradeShop();
      updateHud();
      makeTokenSpark(token.x, tokenY);
    }
  });

  state.ramps.forEach((ramp) => {
    ramp.x -= (135 + bike.worldSpeed) * dt;

    const rampY = roadSurfaceY(ramp.x, ramp.lane) - ramp.h;
    const onRampX = bike.x > ramp.x - 30 && bike.x < ramp.x + ramp.w + 20;
    const onRampY = Math.abs(bike.lane - ramp.lane) < 34 && bike.y > rampY - 52;
    if (!ramp.hit && bike.z === 0 && onRampX && onRampY) {
      ramp.hit = true;
      bike.vz = 545;
      bike.vx += 70;
      bike.worldSpeed = Math.min(maxSpeed, bike.worldSpeed + 100);
      updateHud();
      makeRampDust(ramp);
    }
  });

  state.obstacles.forEach((rock, index) => {
    rock.x -= (120 + bike.worldSpeed) * dt;
    if (rock.x < -90) {
      const pairLane = -28 + Math.random() * 56;
      rock.x = els.canvas.clientWidth + 1050 + Math.random() * 520;
      rock.lane = pairLane;
      rock.cleared = false;
      state.ramps[index].x = rock.x - 185;
      state.ramps[index].lane = pairLane;
      state.ramps[index].hit = false;
    }

    const rockY = roadSurfaceY(rock.x, rock.lane) - rock.h / 2;
    const hitX = Math.abs((bike.x + 8) - (rock.x + rock.w / 2)) < rock.w / 2 + 34;
    const hitY = Math.abs((bike.y + 46) - rockY) < rock.h / 2 + 24;
    if (hitX && hitY && bike.z >= 42 && !rock.cleared) {
      rock.cleared = true;
      state.rideScore += 15;
      state.feedbackText = "Cleared +15";
      state.feedbackTimer = 1.2;
      updateHud();
    } else if (bike.z < 42 && hitX && hitY) {
      bike.vx = Math.min(bike.vx, -90);
      bike.worldSpeed = Math.max(55, bike.worldSpeed * 0.28);
      bike.vz = Math.max(bike.vz, 130);
      bike.tilt = 0.28;
      state.feedbackText = "Jump earlier!";
      state.feedbackTimer = 1.2;
      rock.x -= 28;
      makeCrashDust(rock);
      makeSparks(rock);
    }
  });
}

function makeRampDust(ramp) {
  for (let i = 0; i < 8; i += 1) {
    state.dust.push({
      x: ramp.x + 12 + Math.random() * ramp.w,
      y: roadSurfaceY(ramp.x, ramp.lane),
      life: 0.45,
      r: 4 + Math.random() * 7,
      vx: -90 - state.bike.worldSpeed * 0.1
    });
  }
}

function makeLandingDust() {
  for (let i = 0; i < 10; i += 1) {
    state.dust.push({
      x: state.bike.x - 42 + Math.random() * 82,
      y: roadSurfaceY(state.bike.x, state.bike.lane) - 4,
      life: 0.5,
      r: 5 + Math.random() * 9,
      vx: -70 - state.bike.worldSpeed * 0.08
    });
  }
}

function makeCrashDust(obstacle) {
  for (let i = 0; i < 12; i += 1) {
    state.dust.push({
      x: obstacle.x + Math.random() * obstacle.w,
      y: roadSurfaceY(obstacle.x, obstacle.lane) - 10 + Math.random() * 12,
      life: 0.55,
      r: 5 + Math.random() * 11,
      vx: -95 - Math.random() * 80
    });
  }
}

function makeSparks(obstacle) {
  for (let i = 0; i < 16; i += 1) {
    state.sparks.push({
      x: obstacle.x + obstacle.w * 0.35 + Math.random() * obstacle.w * 0.4,
      y: roadSurfaceY(obstacle.x, obstacle.lane) - obstacle.h * 0.55,
      vx: -140 - Math.random() * 160,
      vy: -120 + Math.random() * 160,
      life: 0.35 + Math.random() * 0.25
    });
  }
}

function makeTokenSpark(x, y) {
  for (let i = 0; i < 14; i += 1) {
    state.sparks.push({
      x,
      y,
      vx: -80 + Math.random() * 160,
      vy: -170 + Math.random() * 130,
      life: 0.35 + Math.random() * 0.25
    });
  }
}

function drawDriveScene() {
  const { width, height } = resizeCanvasForDisplay();

  ctx.clearRect(0, 0, width, height);
  drawSky(width, height);

  drawHills(width, height);
  drawTrack(width, height);
  drawSpeedLines(width, height);
  drawDust();
  drawSparks();
  drawTokens();
  drawRamps();
  drawObstacles();
  drawBike(state.bike.x, state.bike.y);
  drawDriveOverlay(width);
}

function drawSky(width, height) {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.58);
  skyGradient.addColorStop(0, "#77c8ee");
  skyGradient.addColorStop(1, "#d9f3ff");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f8f1d3";
  ctx.beginPath();
  ctx.arc(width - 92, 68, 34, 0, Math.PI * 2);
  ctx.fill();

  drawCloud(width * 0.18 - (state.visualScroll * 0.03) % (width + 220), 72, 1);
  drawCloud(width * 0.68 - (state.visualScroll * 0.045) % (width + 260), 118, 0.78);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.arc(0, 12, 20, 0, Math.PI * 2);
  ctx.arc(24, 4, 25, 0, Math.PI * 2);
  ctx.arc(54, 13, 18, 0, Math.PI * 2);
  ctx.fillRect(-8, 12, 74, 21);
  ctx.fill();
  ctx.restore();
}

function drawHills(width, height) {
  const farOffset = -(state.visualScroll * 0.08) % width;
  ctx.fillStyle = "#6ca866";
  for (let i = -1; i < 2; i += 1) {
    const offset = farOffset + i * width;
    ctx.beginPath();
    ctx.moveTo(offset, height * 0.52);
    ctx.quadraticCurveTo(offset + width * 0.18, height * 0.28, offset + width * 0.45, height * 0.5);
    ctx.quadraticCurveTo(offset + width * 0.72, height * 0.22, offset + width, height * 0.48);
    ctx.lineTo(offset + width, height);
    ctx.lineTo(offset, height);
    ctx.fill();
  }

  ctx.fillStyle = "#529653";
  for (let i = -1; i < 2; i += 1) {
    const offset = farOffset + i * width;
    ctx.beginPath();
    ctx.moveTo(offset, height * 0.58);
    ctx.quadraticCurveTo(offset + width * 0.18, height * 0.34, offset + width * 0.42, height * 0.55);
    ctx.quadraticCurveTo(offset + width * 0.62, height * 0.28, offset + width, height * 0.5);
    ctx.lineTo(offset + width, height);
    ctx.lineTo(offset, height);
    ctx.fill();
  }

  const nearOffset = -(state.visualScroll * 0.16) % width;
  ctx.fillStyle = "#376f44";
  for (let i = -1; i < 2; i += 1) {
    const offset = nearOffset + i * width;
    ctx.beginPath();
    ctx.moveTo(offset, height * 0.64);
    ctx.quadraticCurveTo(offset + width * 0.28, height * 0.44, offset + width * 0.58, height * 0.62);
    ctx.quadraticCurveTo(offset + width * 0.78, height * 0.46, offset + width, height * 0.57);
    ctx.lineTo(offset + width, height);
    ctx.lineTo(offset, height);
    ctx.fill();
  }
}

function drawTrack(width, height) {
  const trackGradient = ctx.createLinearGradient(0, height * 0.52, 0, height);
  trackGradient.addColorStop(0, "#9b6937");
  trackGradient.addColorStop(0.62, "#7f4d28");
  trackGradient.addColorStop(1, "#54331c");
  ctx.fillStyle = trackGradient;
  ctx.fillRect(0, height * 0.52, width, height * 0.48);

  ctx.fillStyle = "rgba(80, 45, 20, 0.12)";
  ctx.beginPath();
  ctx.moveTo(0, roadSurfaceY(0, -72, width, height));
  for (let x = 0; x <= width + 18; x += 18) {
    ctx.lineTo(x, roadSurfaceY(x, -72, width, height));
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  const stripeOffset = -(state.visualScroll * 0.62) % 120;
  ctx.strokeStyle = "rgba(72, 42, 20, 0.12)";
  ctx.lineWidth = 12;
  for (let x = stripeOffset - 160; x < width + 160; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, height * 0.55);
    ctx.lineTo(x + 80, height);
    ctx.stroke();
  }

  drawRoadEdge(width, height, -86, "rgba(72, 43, 20, 0.48)", 5);
  drawRoadEdge(width, height, 74, "rgba(72, 43, 20, 0.48)", 5);

  ctx.strokeStyle = "rgba(255, 235, 190, 0.65)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, roadSurfaceY(0, 0, width, height));
  for (let x = 0; x <= width + 18; x += 18) {
    ctx.lineTo(x, roadSurfaceY(x, 0, width, height));
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 24]);
  ctx.lineDashOffset = -state.visualScroll * 0.75;
  ctx.beginPath();
  ctx.moveTo(0, roadSurfaceY(0, -45, width, height));
  for (let x = 0; x <= width + 18; x += 18) {
    ctx.lineTo(x, roadSurfaceY(x, -45, width, height));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  drawRoadEdge(width, height, 45, "rgba(255,255,255,0.24)", 3);
}

function drawRoadEdge(width, height, lane, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, roadSurfaceY(0, lane, width, height));
  for (let x = 0; x <= width + 18; x += 18) {
    ctx.lineTo(x, roadSurfaceY(x, lane, width, height));
  }
  ctx.stroke();
}

function drawDust() {
  state.dust.forEach((puff) => {
    ctx.globalAlpha = Math.max(0, puff.life * 1.6);
    ctx.fillStyle = "#d0a46c";
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawSparks() {
  state.sparks.forEach((spark) => {
    ctx.globalAlpha = Math.max(0, spark.life * 2.2);
    ctx.fillStyle = "#ffd15c";
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawSpeedLines(width, height) {
  if (state.bike.worldSpeed < 160) {
    return;
  }

  const strength = Math.min(0.5, state.bike.worldSpeed / 900);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = "#f8e6bd";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const offset = -(state.visualScroll * 1.5) % 140;
  for (let x = offset - 140; x < width; x += 140) {
    const y = height * 0.58 + ((x * 37) % 110);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 48, y - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTokens() {
  state.tokens.forEach((token) => {
    if (token.collected) {
      return;
    }

    const y = roadSurfaceY(token.x, token.lane) + token.yOffset + Math.sin(token.spin * 2) * 5;
    const width = 30 + Math.cos(token.spin) * 7;

    ctx.save();
    ctx.translate(token.x, y);
    ctx.fillStyle = "rgba(23, 17, 11, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 28, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const tokenGradient = ctx.createRadialGradient(-7, -7, 3, 0, 0, 25);
    tokenGradient.addColorStop(0, "#fff4a8");
    tokenGradient.addColorStop(0.55, "#f4c744");
    tokenGradient.addColorStop(1, "#b9821d");
    ctx.fillStyle = tokenGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(12, width), 27, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#7d5515";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#4f3510";
    ctx.font = "900 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("KCS", 0, 1);
    ctx.restore();
  });
}

function drawObstacles() {
  state.obstacles.forEach((barrier) => {
    const ground = roadSurfaceY(barrier.x, barrier.lane);
    const y = ground - barrier.h;

    ctx.save();
    ctx.globalAlpha = barrier.cleared ? 0.45 : 1;
    if (!barrier.cleared && barrier.x > state.bike.x && barrier.x < state.bike.x + 420) {
      ctx.fillStyle = "rgba(200, 73, 61, 0.16)";
      ctx.beginPath();
      ctx.roundRect(barrier.x - 12, y - 18, barrier.w + 24, barrier.h + 30, 8);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(23, 17, 11, 0.22)";
    ctx.beginPath();
    ctx.ellipse(barrier.x + barrier.w / 2, ground + 4, barrier.w * 0.72, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#5f3e1c";
    ctx.fillRect(barrier.x, y + 8, barrier.w, barrier.h - 8);

    ctx.fillStyle = "#8d5a2b";
    ctx.beginPath();
    ctx.roundRect(barrier.x - 6, y, barrier.w + 12, 18, 6);
    ctx.fill();

    ctx.strokeStyle = "#2f2117";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(barrier.x + 9, y + 9);
    ctx.lineTo(barrier.x + 22, y + barrier.h - 2);
    ctx.moveTo(barrier.x + barrier.w - 10, y + 9);
    ctx.lineTo(barrier.x + barrier.w - 23, y + barrier.h - 2);
    ctx.stroke();

    ctx.fillStyle = "#f3d36b";
    ctx.fillRect(barrier.x + 12, y + 21, barrier.w - 24, 8);
    ctx.restore();
  });
}

function drawRamps() {
  state.ramps.forEach((ramp) => {
    const y = roadSurfaceY(ramp.x, ramp.lane) - ramp.h;
    if (!ramp.hit && ramp.x > state.bike.x && ramp.x < state.bike.x + 360) {
      ctx.fillStyle = "rgba(217, 155, 43, 0.22)";
      ctx.beginPath();
      ctx.roundRect(ramp.x - 10, y - 12, ramp.w + 20, ramp.h + 24, 8);
      ctx.fill();
    }

    const rampGradient = ctx.createLinearGradient(ramp.x, y, ramp.x + ramp.w, y + ramp.h);
    rampGradient.addColorStop(0, "#f1bd4f");
    rampGradient.addColorStop(1, "#b87425");
    ctx.fillStyle = rampGradient;
    ctx.beginPath();
    ctx.moveTo(ramp.x, y + ramp.h);
    ctx.lineTo(ramp.x + ramp.w, y + ramp.h);
    ctx.lineTo(ramp.x + ramp.w, y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#5f3e1c";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(95, 62, 28, 0.45)";
    ctx.lineWidth = 3;
    for (let stripe = 16; stripe < ramp.w - 8; stripe += 18) {
      ctx.beginPath();
      ctx.moveTo(ramp.x + stripe, y + ramp.h - 4);
      ctx.lineTo(ramp.x + stripe + 13, y + ramp.h - 16);
      ctx.stroke();
    }
  });
}

function drawBike(x, y) {
  const lean = clamp((state.bike.worldSpeed - 220) / 900 + state.bike.vx / 1000 + state.bike.tilt, -0.38, 0.36);
  const airLift = state.bike.z;
  const suspension = state.bike.z > 0 ? 0 : state.bike.suspension;
  const pedal = Math.sin(state.bike.wheelSpin * 2.4);
  const speedBlur = Math.min(1, state.bike.worldSpeed / 420);
  const bikeColor = currentBikeColor();

  ctx.save();
  ctx.globalAlpha = 0.16 + Math.max(0, 0.12 - airLift * 0.001);
  ctx.fillStyle = "#17110b";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 32, 62 - Math.min(34, airLift * 0.18), 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y - airLift);
  ctx.rotate(lean - Math.min(0.22, airLift / 420));

  drawWheel(-34, 24, state.bike.wheelSpin, speedBlur);
  drawWheel(42, 24, state.bike.wheelSpin, speedBlur);

  ctx.strokeStyle = "#2a2f32";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-31, 6);
  ctx.lineTo(-18, -16 - suspension);
  ctx.moveTo(42, 4);
  ctx.lineTo(58, -30 - suspension);
  ctx.stroke();

  ctx.strokeStyle = bikeColor;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-28, 15);
  ctx.lineTo(2, -12);
  ctx.lineTo(40, 15);
  ctx.lineTo(-12, 15);
  ctx.lineTo(2, -12);
  ctx.stroke();

  ctx.fillStyle = bikeColor;
  ctx.beginPath();
  ctx.roundRect(-15, -24, 46, 21, 6);
  ctx.fill();

  ctx.fillStyle = "#fff3d6";
  ctx.beginPath();
  ctx.roundRect(13, -21, 18, 14, 4);
  ctx.fill();

  ctx.fillStyle = "#1c2428";
  ctx.fillRect(-2, -25, 44, 9);

  ctx.strokeStyle = "#1c2428";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(38, -14);
  ctx.lineTo(58, -30);
  ctx.lineTo(70, -28);
  ctx.stroke();

  ctx.strokeStyle = "#2369a8";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(4, -32);
  ctx.lineTo(26, -24 + pedal * 3);
  ctx.lineTo(48, -28);
  ctx.stroke();

  ctx.strokeStyle = "#1a2428";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-2, -20);
  ctx.lineTo(-20, 1 + pedal * 7);
  ctx.moveTo(7, -19);
  ctx.lineTo(23, 6 - pedal * 6);
  ctx.stroke();

  ctx.fillStyle = "#2369a8";
  ctx.save();
  ctx.translate(4, -48 + Math.sin(state.bike.wheelSpin * 3) * 1.5);
  ctx.rotate(-0.35 - lean * 0.4);
  ctx.fillRect(-7, 0, 18, 38);
  ctx.restore();

  ctx.fillStyle = "#d99b2b";
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(21, -58, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (state.bike.worldSpeed > 80) {
    ctx.globalAlpha = Math.min(0.55, state.bike.worldSpeed / 650);
    ctx.fillStyle = "#e8dcc5";
    ctx.beginPath();
    ctx.ellipse(-66, -8, 18 + speedBlur * 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawWheel(x, y, spin, blur) {
  ctx.fillStyle = "#151515";
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8dde0";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#596166";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4 + spin;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
    ctx.stroke();
  }

  if (blur > 0.18) {
    ctx.save();
    ctx.globalAlpha = blur * 0.45;
    ctx.strokeStyle = "#f6f1e8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 18, spin % Math.PI, spin % Math.PI + Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDriveOverlay(width) {
  const speedRatio = clamp(state.bike.worldSpeed / 540, 0, 1);
  ctx.fillStyle = "rgba(255, 250, 240, 0.9)";
  ctx.fillRect(14, 14, 176, 48);
  ctx.fillStyle = "#17211b";
  ctx.font = "800 17px Arial";
  ctx.fillText(`Ride ${formatTime(state.driveRemaining)}`, 28, 44);

  ctx.fillStyle = "rgba(255, 250, 240, 0.9)";
  ctx.fillRect(width - 188, 14, 174, 48);
  ctx.fillStyle = "#17211b";
  ctx.font = "800 17px Arial";
  ctx.fillText(`Tokens ${state.tokensCollected}`, width - 164, 44);

  ctx.fillStyle = "rgba(255, 250, 240, 0.9)";
  ctx.fillRect(14, 72, 176, 52);
  ctx.fillStyle = "#17211b";
  ctx.font = "800 13px Arial";
  ctx.fillText("Speed", 28, 92);
  ctx.fillStyle = "#d8c7a5";
  ctx.fillRect(28, 101, 130, 10);
  ctx.fillStyle = state.keys.has(" ") ? "#c8493d" : "#2f7d55";
  ctx.fillRect(28, 101, 130 * speedRatio, 10);

  if (state.feedbackText) {
    ctx.save();
    ctx.globalAlpha = clamp(state.feedbackTimer, 0, 1);
    ctx.fillStyle = "rgba(23, 33, 27, 0.82)";
    ctx.beginPath();
    ctx.roundRect(width / 2 - 104, 18, 208, 44, 8);
    ctx.fill();
    ctx.fillStyle = "#fffaf0";
    ctx.font = "800 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText(state.feedbackText, width / 2, 47);
    ctx.restore();
  }
}

window.addEventListener("keydown", (event) => {
  const typing = event.target.matches("input, textarea, [contenteditable='true']");
  if (typing) {
    return;
  }

  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(key)) {
    event.preventDefault();
    state.keys.add(key);
  }
});

window.addEventListener("keyup", (event) => {
  state.keys.delete(event.key.toLowerCase());
});

els.endRideButton.addEventListener("click", startWordMode);
els.playButton.addEventListener("click", resetGame);
els.saveScoreButton.addEventListener("click", saveCurrentScore);
els.resetGameButton.addEventListener("click", resetGame);
els.playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveCurrentScore();
  }
});
window.addEventListener("resize", () => {
  if (state.mode === "drive") {
    drawDriveScene();
  }
});

renderLeaderboard();
loadBikeUpgrades();
applyBikeColor();
renderUpgradeShop();
showTitleScreen();
