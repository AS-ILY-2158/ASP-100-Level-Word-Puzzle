
"use strict";

/* =====================================================
   ASP 100 LEVEL WORD PUZZLE
   Main Game Engine - Revised Version
   ===================================================== */

const DATA_FILE = "./JavaScript/levels.json";
const SAVE_KEY = "ASP_WORD_PUZZLE_SAVE_V1";

const $ = (id) => document.getElementById(id);

let levels = [];
let currentLevelIndex = 0;

let playerName = "";
let hearts = 3;
let wrongAttempts = 0;
let hintUsed = false;

let elapsedSeconds = 0;
let timerInterval = null;

let selectedValues = [];
let selectedTileIndices = [];

let gamePaused = false;
let gameStarted = false;

let progress = {
    unlockedLevel: 1,
    completedLevels: {},
    bestTimes: {},
    totalPoints: 0
};


/* =====================================================
   DATA HELPERS
   ===================================================== */

function getField(obj, name) {
    if (!obj || typeof obj !== "object") return undefined;

    const key = Object.keys(obj).find(
        item => item.toLowerCase() === name.toLowerCase()
    );

    return key ? obj[key] : undefined;
}


function normalizeOptions(value) {
    if (Array.isArray(value)) {
        return value.map(letter =>
            String(letter).trim().toUpperCase()
        );
    }

    const raw = String(value || "").trim();

    if (!raw) return [];

    // Supports space-separated letters: A B C
    if (/\s/.test(raw)) {
        return raw.split(/\s+/)
            .filter(Boolean)
            .map(letter => letter.toUpperCase());
    }

    // Supports compact letters: ABC
    return [...raw.toUpperCase()];
}


function normalizeLevel(item) {
    const word = String(
        getField(item, "Correct_Word") || ""
    ).toUpperCase().trim();

    const pattern = String(
        getField(item, "Puzzle_Pattern") || ""
    ).toUpperCase().trim();

    const options = normalizeOptions(
        getField(item, "Letter_Options")
    );

    return {
        number: Number(getField(item, "Level_Number")),
        name: String(
            getField(item, "Level_Name") || "Word Challenge"
        ),
        phase: String(
            getField(item, "Phase_Name") || "Beginner"
        ),
        phaseNumber: String(
            getField(item, "Phase_ID") || "PH-01"
        ),
        word,
        pattern,
        missing: String(
            getField(item, "Missing_Letters") || ""
        ).toUpperCase().trim(),
        options,
        hint: String(
            getField(item, "Hint") || "Complete the missing letters."
        ),
        targetTime: Number(
            getField(item, "Target_Time_Seconds") || 90
        )
    };
}


/* =====================================================
   LOAD LEVEL DATABASE
   ===================================================== */

async function loadLevels() {
    const startButton = $("start-game-btn");

    if (startButton) {
        startButton.disabled = true;
    }

    try {
        const response = await fetch(DATA_FILE, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Database loading failed: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        const rawLevels = Array.isArray(data)
            ? data
            : data.levels || data.Levels || data.data || [];

        if (!Array.isArray(rawLevels)) {
            throw new Error("Invalid level database format.");
        }

        levels = rawLevels.map(normalizeLevel);

        validateDatabase();
        loadSavedProgress();

        if (startButton) {
            startButton.disabled = false;
        }

        const errorElement = $("name-error");

        if (errorElement) {
            errorElement.textContent = "";
        }

        console.log(
            "ASP Game Engine Ready:",
            levels.length,
            "Levels"
        );

    } catch (error) {
        console.error("Game loading error:", error);

        const errorElement = $("name-error");

        if (errorElement) {
            errorElement.textContent =
                "Game database is missing or invalid. Please check JavaScript/levels.json.";
        }
    }
}


/* =====================================================
   DATABASE VALIDATION
   ===================================================== */

function validateDatabase() {
    if (levels.length !== 100) {
        throw new Error(
            `Expected 100 levels, found ${levels.length}.`
        );
    }

    levels.forEach((level, index) => {
        const levelNumber = index + 1;

        if (level.number !== levelNumber) {
            throw new Error(
                `Level numbering error at level ${levelNumber}.`
            );
        }

        if (!level.word || !level.pattern || !level.options.length) {
            throw new Error(
                `Missing data at level ${levelNumber}.`
            );
        }

        if (level.word.length !== level.pattern.length) {
            throw new Error(
                `Pattern length error at level ${levelNumber}.`
            );
        }

        if (level.options.length !== level.word.length) {
            throw new Error(
                `Letter option count error at level ${levelNumber}.`
            );
        }

        if (level.options.some(letter => letter.length !== 1)) {
            throw new Error(
                `Invalid letter tile at level ${levelNumber}.`
            );
        }

        if (level.options.some(letter => !/^[A-Z]$/.test(letter))) {
            throw new Error(
                `Invalid character in options at level ${levelNumber}.`
            );
        }

        const blankPositions = [];

        [...level.pattern].forEach((character, position) => {
            if (character === "_") {
                blankPositions.push(position);
            } else if (character !== level.word[position]) {
                throw new Error(
                    `Fixed letter mismatch at level ${levelNumber}.`
                );
            }
        });

        if (blankPositions.length !== level.missing.length) {
            throw new Error(
                `Missing letter count error at level ${levelNumber}.`
            );
        }

        const expectedMissing = blankPositions
            .map(position => level.word[position])
            .join("");

        if (expectedMissing !== level.missing) {
            throw new Error(
                `Missing letters do not match the answer at level ${levelNumber}.`
            );
        }

        const available = [...level.options];

        for (const letter of level.missing) {
            const position = available.indexOf(letter);

            if (position === -1) {
                throw new Error(
                    `Correct letter option missing at level ${levelNumber}.`
                );
            }

            available.splice(position, 1);
        }

        if (!Number.isFinite(level.targetTime) || level.targetTime <= 0) {
            throw new Error(
                `Invalid target time at level ${levelNumber}.`
            );
        }
    });
}


/* =====================================================
   LOCAL STORAGE
   ===================================================== */

function loadSavedProgress() {
    try {
        const rawSaved = localStorage.getItem(SAVE_KEY);

        if (!rawSaved) return;

        const saved = JSON.parse(rawSaved);

        if (!saved || typeof saved !== "object") return;

        playerName = String(saved.playerName || "");

        progress = {
            unlockedLevel: Math.min(
                100,
                Math.max(1, Number(saved.unlockedLevel) || 1)
            ),
            completedLevels:
                saved.completedLevels &&
                typeof saved.completedLevels === "object"
                    ? saved.completedLevels
                    : {},
            bestTimes:
                saved.bestTimes &&
                typeof saved.bestTimes === "object"
                    ? saved.bestTimes
                    : {},
            totalPoints: Math.max(
                0,
                Number(saved.totalPoints) || 0
            )
        };

        const nameInput = $("player-name");

        if (nameInput) {
            nameInput.value = playerName;
        }

    } catch (error) {
        console.warn(
            "Saved progress could not be loaded:",
            error
        );
    }
}


function saveProgress() {
    const saveData = {
        playerName,
        unlockedLevel: progress.unlockedLevel,
        completedLevels: progress.completedLevels,
        bestTimes: progress.bestTimes,
        totalPoints: progress.totalPoints
    };

    try {
        localStorage.setItem(
            SAVE_KEY,
            JSON.stringify(saveData)
        );
    } catch (error) {
        console.warn(
            "Progress could not be saved:",
            error
        );
    }
}


/* =====================================================
   SCREEN MANAGEMENT
   ===================================================== */

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const target = $(screenId);

    if (target) {
        target.classList.add("active");
    }
}


function showOverlay(overlayId) {
    const overlay = $(overlayId);

    if (overlay) {
        overlay.classList.remove("hidden");
    }
}


function hideOverlay(overlayId) {
    const overlay = $(overlayId);

    if (overlay) {
        overlay.classList.add("hidden");
    }
}


function hideAllOverlays() {
    document.querySelectorAll(".overlay").forEach(overlay => {
        overlay.classList.add("hidden");
    });
}


/* =====================================================
   PLAYER START
   ===================================================== */

function startGame() {
    const nameInput = $("player-name");
    const errorElement = $("name-error");

    if (!nameInput) return;

    const enteredName = nameInput.value.trim();

    if (!enteredName) {
        if (errorElement) {
            errorElement.textContent = "Please enter your name.";
        }

        nameInput.focus();
        return;
    }

    if (!levels.length) {
        if (errorElement) {
            errorElement.textContent =
                "Game levels are not loaded yet.";
        }

        return;
    }

    playerName = enteredName;

    saveProgress();

    currentLevelIndex = progress.unlockedLevel - 1;

    beginLevel(currentLevelIndex);
}


/* =====================================================
   LEVEL INITIALIZATION
   ===================================================== */

function beginLevel(index) {
    if (index < 0 || index >= levels.length) return;

    stopTimer();
    hideAllOverlays();

    currentLevelIndex = index;

    const level = levels[index];

    hearts = 3;
    wrongAttempts = 0;
    hintUsed = false;

    elapsedSeconds = 0;

    const blankCount = (level.pattern.match(/_/g) || []).length;

    selectedValues = Array(blankCount).fill(null);
    selectedTileIndices = Array(blankCount).fill(null);

    gamePaused = false;
    gameStarted = true;

    if ($("display-player-name")) {
        $("display-player-name").textContent = playerName;
    }

    if ($("phase-name")) {
        $("phase-name").textContent =
            `${level.phaseNumber} · ${level.phase}`;
    }

    if ($("level-title")) {
        $("level-title").textContent =
            `LEVEL ${String(level.number).padStart(2, "0")}`;
    }

    if ($("level-name")) {
        $("level-name").textContent = level.name;
    }

    if ($("level-hint")) {
        $("level-hint").textContent = level.hint;
    }

    if ($("game-feedback")) {
        $("game-feedback").textContent = "";
        $("game-feedback").className = "feedback-message";
    }

    if ($("hint-btn")) {
        $("hint-btn").disabled = false;
    }

    if ($("progress-text")) {
        $("progress-text").textContent =
            `${level.number} / 100`;
    }

    if ($("progress-bar")) {
        $("progress-bar").style.width =
            `${level.number}%`;
    }

    updateTimer();
    updateHearts();
    renderPuzzle();
    renderOptions();

    showScreen("game-screen");

    startTimer();
}


/* =====================================================
   PUZZLE RENDERING
   ===================================================== */

function getBlankPositions() {
    const level = levels[currentLevelIndex];

    if (!level) return [];

    const positions = [];

    [...level.pattern].forEach((character, index) => {
        if (character === "_") {
            positions.push(index);
        }
    });

    return positions;
}


function renderPuzzle() {
    const level = levels[currentLevelIndex];
    const container = $("word-pattern");

    if (!level || !container) return;

    container.innerHTML = "";

    let blankIndex = 0;

    [...level.pattern].forEach((character, index) => {
        const slot = document.createElement("button");

        slot.type = "button";
        slot.className = "letter-slot";

        if (character === "_") {
            const currentBlank = blankIndex;

            slot.dataset.blankIndex = currentBlank;

            slot.textContent =
                selectedValues[currentBlank] || "";

            if (selectedValues[currentBlank]) {
                slot.classList.add("filled");
            }

            slot.disabled = !gameStarted || gamePaused;

            slot.addEventListener("click", () => {
                removeLetter(currentBlank);
            });

            blankIndex++;

        } else {
            slot.textContent = character;
            slot.classList.add("fixed-letter");
            slot.disabled = true;
        }

        container.appendChild(slot);
    });
}


/* =====================================================
   LETTER OPTIONS
   ===================================================== */

function renderOptions() {
    const level = levels[currentLevelIndex];
    const container = $("letter-options");

    if (!level || !container) return;

    container.innerHTML = "";

    level.options.forEach((letter, index) => {
        const tile = document.createElement("button");

        tile.type = "button";
        tile.className = "letter-tile";
        tile.textContent = letter;

        const isUsed = selectedTileIndices.includes(index);

        if (isUsed) {
            tile.classList.add("selected");
        }

        tile.disabled = isUsed || !gameStarted || gamePaused;

        tile.addEventListener("click", () => {
            selectLetter(index);
        });

        container.appendChild(tile);
    });
}


function selectLetter(tileIndex) {
    if (!gameStarted || gamePaused) return;

    if (selectedTileIndices.includes(tileIndex)) return;

    const level = levels[currentLevelIndex];

    if (!level || !level.options[tileIndex]) return;

    const blankIndex = selectedValues.findIndex(
        value => value === null || value === undefined
    );

    if (blankIndex === -1) return;

    const letter = level.options[tileIndex];

    selectedValues[blankIndex] = letter;
    selectedTileIndices[blankIndex] = tileIndex;

    renderPuzzle();
    renderOptions();
}


function removeLetter(blankIndex) {
    if (!gameStarted || gamePaused) return;

    if (!selectedValues[blankIndex]) return;

    selectedValues[blankIndex] = null;
    selectedTileIndices[blankIndex] = null;

    renderPuzzle();
    renderOptions();
}


function resetWord() {
    if (!gameStarted || gamePaused) return;

    const blankCount = getBlankPositions().length;

    selectedValues = Array(blankCount).fill(null);
    selectedTileIndices = Array(blankCount).fill(null);

    renderPuzzle();
    renderOptions();

    showFeedback("", "");
}


/* =====================================================
   ANSWER VALIDATION
   ===================================================== */

function buildAnswer() {
    const level = levels[currentLevelIndex];

    if (!level) return "";

    let blankIndex = 0;
    let answer = "";

    [...level.pattern].forEach(character => {
        if (character === "_") {
            answer += selectedValues[blankIndex] || "";
            blankIndex++;
        } else {
            answer += character;
        }
    });

    return answer.toUpperCase();
}


function checkWord() {
    if (!gameStarted || gamePaused) return;

    const level = levels[currentLevelIndex];

    if (!level) return;

    const blankCount = getBlankPositions().length;

    if (
        selectedValues.length !== blankCount ||
        selectedValues.some(value => !value)
    ) {
        showFeedback(
            "Complete all missing letters first.",
            "warning"
        );

        return;
    }

    const answer = buildAnswer();

    if (answer === level.word) {
        completeLevel();

    } else {
        wrongAttempts++;
        hearts--;

        updateHearts();

        if (hearts <= 0) {
            gameOver();

        } else {
            showFeedback(
                `Incorrect answer. ${hearts} ${
                    hearts === 1 ? "heart" : "hearts"
                } remaining.`,
                "error"
            );
        }
    }
}


function showFeedback(message, type) {
    const feedback = $("game-feedback");

    if (!feedback) return;

    feedback.textContent = message;
    feedback.className = `feedback-message ${type || ""}`;
}


/* =====================================================
   HEARTS
   ===================================================== */

function updateHearts() {
    const container = $("hearts-container");

    if (!container) return;

    container.innerHTML = "";

    for (let i = 0; i < 3; i++) {
        const heart = document.createElement("span");

        heart.textContent = i < hearts ? "♥" : "♡";

        heart.className =
            i < hearts ? "heart active" : "heart lost";

        container.appendChild(heart);
    }
}


/* =====================================================
   HINT SYSTEM
   Reveals the next missing letter.
   ===================================================== */

function useHint() {
    if (!gameStarted || gamePaused) return;

    if (hintUsed) {
        showFeedback(
            "You have already used your hint.",
            "warning"
        );

        return;
    }

    const level = levels[currentLevelIndex];

    if (!level) return;

    const blankIndex = selectedValues.findIndex(
        value => value === null || value === undefined
    );

    if (blankIndex === -1) {
        showFeedback(
            "All letters are already filled.",
            "warning"
        );

        return;
    }

    const blankPositions = getBlankPositions();
    const wordPosition = blankPositions[blankIndex];

    const correctLetter = level.word[wordPosition];

    const availableIndex = level.options.findIndex(
        (letter, index) =>
            letter === correctLetter &&
            !selectedTileIndices.includes(index)
    );

    selectedValues[blankIndex] = correctLetter;

    selectedTileIndices[blankIndex] =
        availableIndex !== -1 ? availableIndex : null;

    hintUsed = true;

    if ($("hint-btn")) {
        $("hint-btn").disabled = true;
    }

    renderPuzzle();
    renderOptions();

    showFeedback(
        "One missing letter has been revealed.",
        "success"
    );
}


/* =====================================================
   TIMER
   Elapsed stopwatch, not countdown.
   ===================================================== */

function startTimer() {
    stopTimer();

    timerInterval = setInterval(() => {
        if (!gameStarted || gamePaused) {
            return;
        }

        elapsedSeconds++;

        updateTimer();

    }, 1000);
}


function stopTimer() {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}


function updateTimer() {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;

    const timer = $("game-timer");

    if (timer) {
        timer.textContent =
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
}


/* =====================================================
   STAR CALCULATION
   ===================================================== */

function calculateStars() {
    const level = levels[currentLevelIndex];

    if (!level) return 0;

    const target = level.targetTime;

    // Three stars: fast, no mistakes, no hint.
    if (
        elapsedSeconds <= target &&
        wrongAttempts === 0 &&
        !hintUsed
    ) {
        return 3;
    }

    // Hint usage can never earn more than two stars.
    if (
        elapsedSeconds <= target * 1.6 &&
        wrongAttempts <= 1
    ) {
        return 2;
    }

    return 1;
}


function calculatePoints(stars) {
    return (
        stars * 100 +
        hearts * 25 +
        Math.max(0, 100 - wrongAttempts * 20)
    );
}


/* =====================================================
   LEVEL COMPLETION
   ===================================================== */

function completeLevel() {
    if (!gameStarted) return;

    stopTimer();

    gameStarted = false;

    const level = levels[currentLevelIndex];

    const stars = calculateStars();
    const points = calculatePoints(stars);

    const key = String(level.number);

    const oldResult = progress.completedLevels[key] || {};

    const oldPoints = Number(oldResult.points) || 0;
    const oldStars = Number(oldResult.stars) || 0;

    // Keep the best result for this level.
    progress.completedLevels[key] = {
        stars: Math.max(stars, oldStars),
        time: !oldResult.time
            ? elapsedSeconds
            : Math.min(elapsedSeconds, oldResult.time),
        points: Math.max(points, oldPoints)
    };

    const oldBest = progress.bestTimes[key];

    if (!oldBest || elapsedSeconds < oldBest) {
        progress.bestTimes[key] = elapsedSeconds;
    }

    // Add only the improvement, preventing replay point farming.
    progress.totalPoints += Math.max(0, points - oldPoints);

    progress.unlockedLevel = Math.max(
        progress.unlockedLevel,
        Math.min(100, level.number + 1)
    );

    saveProgress();

    if ($("success-player-name")) {
        $("success-player-name").textContent =
            `Well done, ${playerName}!`;
    }

    if ($("earned-stars")) {
        $("earned-stars").textContent =
            "★ ".repeat(stars) + "☆ ".repeat(3 - stars);
    }

    if ($("result-time")) {
        $("result-time").textContent =
            $("game-timer")
                ? $("game-timer").textContent
                : "00:00";
    }

    if ($("result-hearts")) {
        $("result-hearts").textContent = hearts;
    }

    if ($("result-mistakes")) {
        $("result-mistakes").textContent = wrongAttempts;
    }

    if ($("result-points")) {
        $("result-points").textContent = points;
    }

    if ($("next-level-btn")) {
        $("next-level-btn").textContent =
            level.number === 100 ? "FINISH GAME" : "NEXT LEVEL";

        $("next-level-btn").disabled = false;
    }

    showOverlay("success-screen");
}


/* =====================================================
   GAME OVER
   ===================================================== */

function gameOver() {
    stopTimer();

    gameStarted = false;

    const message = $("game-over-message");

    if (message) {
        message.textContent =
            `You used all three hearts on Level ${levels[currentLevelIndex].number}.`;
    }

    showOverlay("game-over-screen");
}


/* =====================================================
   RETRY AND NEXT LEVEL
   ===================================================== */

function retryLevel() {
    beginLevel(currentLevelIndex);
}


function nextLevel() {
    if (currentLevelIndex >= 99) {
        stopTimer();

        gameStarted = false;

        hideAllOverlays();

        const message = $("info-content");

        if (message) {
            message.textContent =
                `Congratulations ${playerName}! You completed all 100 levels.`;
        }

        showOverlay("info-screen");

        return;
    }

    beginLevel(currentLevelIndex + 1);
}


/* =====================================================
   MAIN MENU
   ===================================================== */

function goToMainMenu() {
    stopTimer();

    gameStarted = false;
    gamePaused = false;

    hideAllOverlays();

    if ($("player-name")) {
        $("player-name").value = playerName;
    }

    if ($("name-error")) {
        $("name-error").textContent = "";
    }

    showScreen("welcome-screen");
}


/* =====================================================
   SETTINGS
   ===================================================== */

function openSettings() {
    if (!gameStarted || gamePaused) return;

    gamePaused = true;

    showOverlay("settings-screen");

    renderPuzzle();
    renderOptions();
}


function closeSettings() {
    hideOverlay("settings-screen");

    gamePaused = false;

    if (gameStarted) {
        renderPuzzle();
        renderOptions();
    }
}


function restartCurrentLevel() {
    hideOverlay("settings-screen");

    beginLevel(currentLevelIndex);
}


/* =====================================================
   INFORMATION BUTTONS
   ===================================================== */

function openInformation(message) {
    const content = $("info-content");

    if (content) {
        content.textContent = message;
    }

    showOverlay("info-screen");
}


/* =====================================================
   KEYBOARD SUPPORT
   ===================================================== */

document.addEventListener("keydown", event => {
    if (!gameStarted || gamePaused) return;

    if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    const key = event.key.toUpperCase();

    if (/^[A-Z]$/.test(key)) {
        const level = levels[currentLevelIndex];

        const tileIndex = level.options.findIndex(
            (letter, index) =>
                letter === key &&
                !selectedTileIndices.includes(index)
        );

        if (tileIndex !== -1) {
            selectLetter(tileIndex);
        }
    }

    if (event.key === "Enter") {
        event.preventDefault();
        checkWord();
    }

    if (event.key === "Escape") {
        event.preventDefault();
        openSettings();
    }
});


/* =====================================================
   EVENT LISTENER HELPER
   ===================================================== */

function addClickListener(id, callback) {
    const element = $(id);

    if (element) {
        element.addEventListener("click", callback);
    }
}


/* =====================================================
   EVENT LISTENERS
   ===================================================== */

addClickListener("start-game-btn", startGame);

addClickListener("check-word-btn", checkWord);

addClickListener("reset-word-btn", resetWord);

addClickListener("hint-btn", useHint);

addClickListener("settings-btn", openSettings);

addClickListener("close-settings-btn", closeSettings);

addClickListener("resume-game-btn", closeSettings);

addClickListener("restart-game-btn", restartCurrentLevel);

addClickListener("settings-home-btn", goToMainMenu);

addClickListener("next-level-btn", nextLevel);

addClickListener("success-home-btn", goToMainMenu);

addClickListener("success-retry-btn", retryLevel);

addClickListener("try-again-btn", retryLevel);

addClickListener("game-over-home-btn", goToMainMenu);

addClickListener("close-info-btn", () => {
    hideOverlay("info-screen");
});


/* =====================================================
   PLAYER NAME INPUT
   ===================================================== */

const playerNameInput = $("player-name");

if (playerNameInput) {
    playerNameInput.addEventListener("input", () => {
        if ($("name-error")) {
            $("name-error").textContent = "";
        }
    });

    playerNameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            startGame();
        }
    });
}


/* =====================================================
   INFORMATION BUTTONS
   ===================================================== */

document.querySelectorAll("[data-info]").forEach(button => {
    button.addEventListener("click", () => {
        openInformation(button.dataset.info);
    });
});


/* =====================================================
   INITIALIZE GAME
   ===================================================== */

if ($("start-game-btn")) {
    $("start-game-btn").disabled = true;
}

loadLevels();
