
"use strict";

/* =========================================
   ASP 100 LEVEL WORD PUZZLE
   Main Game Engine
   ========================================= */

const DATA_FILE = "./JavaScript/levels.json";
const SAVE_KEY = "ASP_WORD_PUZZLE_SAVE_V1";

const $ = (id) => document.getElementById(id);

const screens = {
    welcome: $("welcome-screen"),
    game: $("game-screen")
};

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


/* =========================================
   DATA NORMALIZATION
   Supports database field names
   ========================================= */

function getField(obj, name) {
    if (!obj) return undefined;

    const key = Object.keys(obj).find(
        k => k.toLowerCase() === name.toLowerCase()
    );

    return key ? obj[key] : undefined;
}

function normalizeLevel(item) {
    const word = String(
        getField(item, "Correct_Word") || ""
    ).toUpperCase().trim();

    const pattern = String(
        getField(item, "Puzzle_Pattern") || ""
    ).toUpperCase().trim();

    let options = getField(item, "Letter_Options");

    if (Array.isArray(options)) {
        options = options.map(v => String(v).toUpperCase());
    } else {
        options = String(options || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(v => v.toUpperCase());
    }

    return {
        number: Number(getField(item, "Level_Number")),
        name: getField(item, "Level_Name") || "Word Challenge",
        phase: getField(item, "Phase_Name") || "Beginner",
        phaseNumber: getField(item, "Phase_ID") || "PH-01",
        word,
        pattern,
        missing: String(
            getField(item, "Missing_Letters") || ""
        ).toUpperCase().trim(),
        options,
        hint: getField(item, "Hint") || "Complete the missing letters.",
        targetTime: Number(
            getField(item, "Target_Time_Seconds") || 90
        )
    };
}


/* =========================================
   LOAD LEVEL DATABASE
   ========================================= */

async function loadLevels() {
    try {
        const response = await fetch(DATA_FILE);

        if (!response.ok) {
            throw new Error("Level database could not be loaded.");
        }

        const data = await response.json();

        const rawLevels = Array.isArray(data)
            ? data
            : data.levels || data.Levels || data.data || [];

        levels = rawLevels.map(normalizeLevel);

        validateDatabase();

        loadSavedProgress();

        $("start-game-btn").disabled = false;

        console.log("ASP Game Engine Ready:", levels.length, "Levels");

    } catch (error) {
        console.error(error);

        $("name-error").textContent =
            "Level database is missing or invalid. Please check levels.json.";

        $("start-game-btn").disabled = true;
    }
}


/* =========================================
   DATABASE VALIDATION
   ========================================= */

function validateDatabase() {
    if (levels.length !== 100) {
        throw new Error(
            `Expected 100 levels, found ${levels.length}.`
        );
    }

    levels.forEach((level, index) => {
        if (!level.word || !level.pattern || !level.options.length) {
            throw new Error(`Invalid data at level ${index + 1}.`);
        }

        if (level.word.length !== level.pattern.length) {
            throw new Error(`Pattern length error at level ${index + 1}.`);
        }

        if (level.options.length !== level.word.length) {
            throw new Error(`Letter option count error at level ${index + 1}.`);
        }

        if (level.options.some(letter => letter.length !== 1)) {
            throw new Error(`Invalid letter tile at level ${index + 1}.`);
        }

        const blankCount = (level.pattern.match(/_/g) || []).length;

        if (blankCount !== level.missing.length) {
            throw new Error(`Missing letter count error at level ${index + 1}.`);
        }

        const available = [...level.options];

        for (const letter of level.missing) {
            const position = available.indexOf(letter);

            if (position === -1) {
                throw new Error(
                    `Missing correct option at level ${index + 1}.`
                );
            }

            available.splice(position, 1);
        }
    });
}


/* =========================================
   LOCAL STORAGE
   ========================================= */

function loadSavedProgress() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(SAVE_KEY)
        );

        if (!saved) return;

        playerName = saved.playerName || "";

        progress = {
            unlockedLevel: Math.min(
                100,
                Math.max(1, Number(saved.unlockedLevel) || 1)
            ),
            completedLevels: saved.completedLevels || {},
            bestTimes: saved.bestTimes || {},
            totalPoints: Number(saved.totalPoints) || 0
        };

        $("player-name").value = playerName;

    } catch (error) {
        console.warn("Saved progress could not be loaded.", error);
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
        console.warn("Progress could not be saved.", error);
    }
}


/* =========================================
   SCREEN MANAGEMENT
   ========================================= */

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const target = $(screenId);

    if (target) target.classList.add("active");
}

function showOverlay(overlayId) {
    $(overlayId).classList.remove("hidden");
}

function hideOverlay(overlayId) {
    $(overlayId).classList.add("hidden");
}

function hideAllOverlays() {
    document.querySelectorAll(".overlay").forEach(overlay => {
        overlay.classList.add("hidden");
    });
}


/* =========================================
   PLAYER START
   ========================================= */

function startGame() {
    const enteredName = $("player-name").value.trim();

    if (!enteredName) {
        $("name-error").textContent = "Please enter your name.";
        $("player-name").focus();
        return;
    }

    if (!levels.length) return;

    playerName = enteredName;

    saveProgress();

    currentLevelIndex = progress.unlockedLevel - 1;

    beginLevel(currentLevelIndex);
}


/* =========================================
   LEVEL INITIALIZATION
   ========================================= */

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

    selectedValues = [];
    selectedTileIndices = [];

    gamePaused = false;
    gameStarted = true;

    $("display-player-name").textContent = playerName;

    $("phase-name").textContent =
        `${level.phaseNumber} · ${level.phase}`;

    $("level-title").textContent =
        `LEVEL ${String(level.number).padStart(2, "0")}`;

    $("level-name").textContent = level.name;

    $("level-hint").textContent = level.hint;

    $("game-feedback").textContent = "";

    $("hint-btn").disabled = false;

    $("progress-text").textContent =
        `${level.number} / 100`;

    $("progress-bar").style.width =
        `${level.number}%`;

    updateTimer();
    updateHearts();
    renderPuzzle();
    renderOptions();

    showScreen("game-screen");

    startTimer();
}


/* =========================================
   PUZZLE RENDERING
   ========================================= */

function getBlankPositions() {
    const level = levels[currentLevelIndex];

    const positions = [];

    [...level.pattern].forEach((character, index) => {
        if (character === "_") positions.push(index);
    });

    return positions;
}

function renderPuzzle() {
    const level = levels[currentLevelIndex];

    const positions = getBlankPositions();

    const container = $("word-pattern");

    container.innerHTML = "";

    let blankIndex = 0;

    [...level.pattern].forEach((character, index) => {
        const slot = document.createElement("button");

        slot.type = "button";
        slot.className = "letter-slot";

        if (character === "_") {
            slot.dataset.blankIndex = blankIndex;

            slot.textContent =
                selectedValues[blankIndex] || "";

            if (selectedValues[blankIndex]) {
                slot.classList.add("filled");
            }

            slot.addEventListener("click", () => {
                removeLetter(blankIndex);
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


/* =========================================
   LETTER OPTIONS
   ========================================= */

function renderOptions() {
    const level = levels[currentLevelIndex];

    const container = $("letter-options");

    container.innerHTML = "";

    level.options.forEach((letter, index) => {
        const tile = document.createElement("button");

        tile.type = "button";
        tile.className = "letter-tile";
        tile.textContent = letter;

        const isUsed = selectedTileIndices.includes(index);

        if (isUsed) {
            tile.classList.add("selected");
            tile.disabled = true;
        }

        tile.addEventListener("click", () => {
            selectLetter(index);
        });

        container.appendChild(tile);
    });
}

function selectLetter(tileIndex) {
    if (selectedTileIndices.includes(tileIndex)) return;

    const blankIndex = selectedValues.findIndex(
        value => value === null || value === undefined
    );

    if (blankIndex === -1) return;

    const letter = levels[currentLevelIndex].options[tileIndex];

    selectedValues[blankIndex] = letter;
    selectedTileIndices[blankIndex] = tileIndex;

    renderPuzzle();
    renderOptions();
}

function removeLetter(blankIndex) {
    if (!selectedValues[blankIndex]) return;

    selectedValues[blankIndex] = null;
    selectedTileIndices[blankIndex] = null;

    renderPuzzle();
    renderOptions();
}

function resetWord() {
    selectedValues = [];
    selectedTileIndices = [];

    renderPuzzle();
    renderOptions();

    $("game-feedback").textContent = "";
}


/* =========================================
   ANSWER VALIDATION
   ========================================= */

function buildAnswer() {
    const level = levels[currentLevelIndex];

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
    const level = levels[currentLevelIndex];

    const blankCount = getBlankPositions().length;

    if (
        selectedValues.length < blankCount ||
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
                `Incorrect answer. ${hearts} ${hearts === 1 ? "heart" : "hearts"} remaining.`,
                "error"
            );
        }
    }
}

function showFeedback(message, type) {
    const feedback = $("game-feedback");

    feedback.textContent = message;
    feedback.className = `feedback-message ${type}`;
}


/* =========================================
   HEARTS
   ========================================= */

function updateHearts() {
    const container = $("hearts-container");

    container.innerHTML = "";

    for (let i = 0; i < 3; i++) {
        const heart = document.createElement("span");

        heart.textContent = i < hearts ? "♥" : "♡";

        heart.className =
            i < hearts ? "heart active" : "heart lost";

        container.appendChild(heart);
    }
}


/* =========================================
   HINT SYSTEM
   Reveals the next missing letter.
   ========================================= */

function useHint() {
    if (hintUsed) {
        showFeedback("You have already used your hint.", "warning");
        return;
    }

    const blankCount = getBlankPositions().length;

    const blankIndex = selectedValues.findIndex(
        value => value === null || value === undefined
    );

    if (blankIndex === -1) {
        showFeedback("All letters are already filled.", "warning");
        return;
    }

    const correctLetter = levels[currentLevelIndex].missing[blankIndex];

    const availableIndex = levels[currentLevelIndex].options.findIndex(
        (letter, index) =>
            letter === correctLetter &&
            !selectedTileIndices.includes(index)
    );

    selectedValues[blankIndex] = correctLetter;

    if (availableIndex !== -1) {
        selectedTileIndices[blankIndex] = availableIndex;
    } else {
        selectedTileIndices[blankIndex] = null;
    }

    hintUsed = true;

    $("hint-btn").disabled = true;

    renderPuzzle();
    renderOptions();

    showFeedback("One missing letter has been revealed.", "success");
}


/* =========================================
   TIMER
   Elapsed stopwatch, not countdown.
   ========================================= */

function startTimer() {
    stopTimer();

    timerInterval = setInterval(() => {
        if (
            !gameStarted ||
            gamePaused ||
            !$("settings-screen").classList.contains("hidden")
        ) {
            return;
        }

        elapsedSeconds++;

        updateTimer();

    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimer() {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;

    $("game-timer").textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


/* =========================================
   STAR CALCULATION
   ========================================= */

function calculateStars() {
    const level = levels[currentLevelIndex];

    const target = level.targetTime;

    if (
        elapsedSeconds <= target &&
        wrongAttempts === 0 &&
        !hintUsed
    ) {
        return 3;
    }

    if (
        elapsedSeconds <= target * 1.6 &&
        wrongAttempts <= 1
    ) {
        return hintUsed ? 2 : 2;
    }

    return hearts > 0 ? 1 : 0;
}

function calculatePoints(stars) {
    return (
        stars * 100 +
        hearts * 25 +
        Math.max(0, 100 - wrongAttempts * 20)
    );
}


/* =========================================
   LEVEL COMPLETION
   ========================================= */

function completeLevel() {
    stopTimer();

    gameStarted = false;

    const level = levels[currentLevelIndex];

    const stars = calculateStars();

    const points = calculatePoints(stars);

    const key = String(level.number);

    const oldResult = progress.completedLevels[key] || {};

    progress.completedLevels[key] = {
        stars: Math.max(stars, oldResult.stars || 0),
        time: elapsedSeconds,
        points: Math.max(points, oldResult.points || 0)
    };

    const oldBest = progress.bestTimes[key];

    if (!oldBest || elapsedSeconds < oldBest) {
        progress.bestTimes[key] = elapsedSeconds;
    }

    progress.totalPoints += points;

    progress.unlockedLevel = Math.max(
        progress.unlockedLevel,
        Math.min(100, level.number + 1)
    );

    saveProgress();

    $("success-player-name").textContent =
        `Well done, ${playerName}!`;

    $("earned-stars").textContent =
        "★ ".repeat(stars) + "☆ ".repeat(3 - stars);

    $("result-time").textContent =
        $("game-timer").textContent;

    $("result-hearts").textContent = hearts;

    $("result-mistakes").textContent = wrongAttempts;

    $("result-points").textContent = points;

    $("next-level-btn").textContent =
        level.number === 100 ? "FINISH GAME" : "NEXT LEVEL";

    $("next-level-btn").disabled = false;

    showOverlay("success-screen");
}


/* =========================================
   GAME OVER
   ========================================= */

function gameOver() {
    stopTimer();

    gameStarted = false;

    $("game-over-message").textContent =
        `You used all three hearts on Level ${levels[currentLevelIndex].number}.`;

    showOverlay("game-over-screen");
}


/* =========================================
   RETRY AND NEXT LEVEL
   ========================================= */

function retryLevel() {
    beginLevel(currentLevelIndex);
}

function nextLevel() {
    if (currentLevelIndex >= 99) {
        stopTimer();
        hideAllOverlays();

        $("info-content").textContent =
            `Congratulations ${playerName}! You completed all 100 levels.`;

        showOverlay("info-screen");

        return;
    }

    beginLevel(currentLevelIndex + 1);
}


/* =========================================
   MAIN MENU
   ========================================= */

function goToMainMenu() {
    stopTimer();

    gameStarted = false;
    gamePaused = false;

    hideAllOverlays();

    $("player-name").value = playerName;

    $("name-error").textContent = "";

    showScreen("welcome-screen");
}


/* =========================================
   SETTINGS
   ========================================= */

function openSettings() {
    gamePaused = true;
    showOverlay("settings-screen");
}

function closeSettings() {
    hideOverlay("settings-screen");
    gamePaused = false;
}

function restartCurrentLevel() {
    hideOverlay("settings-screen");
    beginLevel(currentLevelIndex);
}


/* =========================================
   INFORMATION BUTTONS
   ========================================= */

function openInformation(message) {
    $("info-content").textContent = message;
    showOverlay("info-screen");
}


/* =========================================
   KEYBOARD SUPPORT
   ========================================= */

document.addEventListener("keydown", event => {
    if (!gameStarted || gamePaused) return;

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
        checkWord();
    }

    if (event.key === "Escape") {
        openSettings();
    }
});


/* =========================================
   EVENT LISTENERS
   ========================================= */

$("start-game-btn").addEventListener("click", startGame);

$("check-word-btn").addEventListener("click", checkWord);

$("reset-word-btn").addEventListener("click", resetWord);

$("hint-btn").addEventListener("click", useHint);

$("settings-btn").addEventListener("click", openSettings);

$("close-settings-btn").addEventListener("click", closeSettings);

$("resume-game-btn").addEventListener("click", closeSettings);

$("restart-game-btn").addEventListener("click", restartCurrentLevel);

$("settings-home-btn").addEventListener("click", goToMainMenu);

$("next-level-btn").addEventListener("click", nextLevel);

$("success-home-btn").addEventListener("click", goToMainMenu);

$("success-retry-btn").addEventListener("click", retryLevel);

$("try-again-btn").addEventListener("click", retryLevel);

$("game-over-home-btn").addEventListener("click", goToMainMenu);

$("close-info-btn").addEventListener("click", () => {
    hideOverlay("info-screen");
});

$("player-name").addEventListener("input", () => {
    $("name-error").textContent = "";
});

$("player-name").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        startGame();
    }
});

document.querySelectorAll("[data-info]").forEach(button => {
    button.addEventListener("click", () => {
        openInformation(button.dataset.info);
    });
});


/* =========================================
   INITIALIZE GAME
   ========================================= */

$("start-game-btn").disabled = true;

loadLevels();
