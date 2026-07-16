// --- Core Analytics & Persistent Database Variables (LocalStorage Driven) ---
let timer;
let isRunning = localStorage.getItem('lockdIn_isRunning') === 'true';
let currentMode = localStorage.getItem('lockdIn_currentMode') || 'focus'; 
let isLightMode = localStorage.getItem('lockdIn_lightMode') === 'true';
let pendingCompletionSound = null;

// Robust parsing checks to eliminate null-glitch resets completely
let storedFocus = parseInt(localStorage.getItem('lockdIn_selectedFocus'));
let selectedFocusDuration = isNaN(storedFocus) ? 180 * 60 : storedFocus;

let storedRest = parseInt(localStorage.getItem('lockdIn_selectedRest'));
let selectedRestDuration = isNaN(storedRest) ? 5 * 60 : storedRest;

let storedTime = parseInt(localStorage.getItem('lockdIn_timeLeft'));
let timeLeft = isNaN(storedTime) ? selectedFocusDuration : storedTime;

let storedTarget = parseInt(localStorage.getItem('lockdIn_totalTarget'));
let currentSessionTotalTarget = isNaN(storedTarget) ? selectedFocusDuration : storedTarget;

let totalTrophies = parseInt(localStorage.getItem('lockdIn_trophyCount')) || 0;
let historicalLogsStack = JSON.parse(localStorage.getItem('lockdIn_terminalLogs')) || [];

const metricsDatabase = JSON.parse(localStorage.getItem('lockdIn_metricsDatabase')) || {
    daily: [
        { label: 'Sun', mins: 0 }, { label: 'Mon', mins: 0 }, { label: 'Tue', mins: 0 },
        { label: 'Wed', mins: 0 }, { label: 'Thu', mins: 0 }, { label: 'Fri', mins: 0 }, { label: 'Sat', mins: 0 }
    ],
    weekly: [
        { label: 'Wk 1', mins: 0 }, { label: 'Wk 2', mins: 0 }, { label: 'Wk 3', mins: 0 },
        { label: 'Wk 4', mins: 0 }, { label: 'Wk 5', mins: 0 }
    ],
    monthly: [
        { label: 'Jan', mins: 0 }, { label: 'Feb', mins: 0 }, { label: 'Mar', mins: 0 },
        { label: 'Apr', mins: 0 }, { label: 'May', mins: 0 }
    ]
};

// --- DOM Cache Elements ---
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const pipBtn = document.getElementById('pipBtn');
const stateIndicator = document.getElementById('stateIndicator');
const inlineTaskDisplay = document.getElementById('inlineTaskDisplay');
const taskSpaceContainer = document.getElementById('taskSpaceContainer');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const widget = document.getElementById('widget');
const trophyCabinet = document.getElementById('trophyCabinet');
const terminalLogBody = document.getElementById('terminalLogBody');
const barChartContainer = document.getElementById('barChartContainer');
const chartTimelineSelector = document.getElementById('chartTimelineSelector');
const widgetCelebrationOverlay = document.getElementById('widgetCelebrationOverlay');
const globalVisitorCount = document.getElementById('globalVisitorCount');
const taskInputField = document.getElementById('taskInputField');

// Profile Card Elements
const downloadCardBtn = document.getElementById('downloadCardBtn');
const cardTimelineSelector = document.querySelector('.profile-card-section #cardTimelineSelector');
const cardTimelineLabel = document.getElementById('cardTimelineLabel');
const cardMetricsDisplay = document.getElementById('cardMetricsDisplay');
const cardTrophyBadge = document.getElementById('cardTrophyBadge');
const profileCardCanvasFrame = document.getElementById('profileCardCanvasFrame');

let resetClickCount = 0;
let resetClickTimeout;

const focusEndSound = document.getElementById('focusEndSound');
const restEndSound = document.getElementById('restEndSound');

const hoursWheel = document.getElementById('hoursWheel');
const minsWheel = document.getElementById('minsWheel');
const secsWheel = document.getElementById('secsWheel');

// --- Sync Session Storage Runtime Configuration ---
function saveTimerStateToLocalStorage() {
    localStorage.setItem('lockdIn_timeLeft', timeLeft);
    localStorage.setItem('lockdIn_currentMode', currentMode);
    localStorage.setItem('lockdIn_totalTarget', currentSessionTotalTarget);
    localStorage.setItem('lockdIn_isRunning', isRunning);
    
    if (isRunning) {
        localStorage.setItem('lockdIn_expectedEndTime', Date.now() + (timeLeft * 1000));
    } else {
        localStorage.removeItem('lockdIn_expectedEndTime');
    }
}

// --- Wheel Elements Populator System ---
function initializeWheels() {
    let hoursHTML = '';
    let minsSecsHTML = '';
    for(let i = 0; i <= 24; i++) hoursHTML += `<div>${i.toString().padStart(2, '0')}</div>`;
    for(let i = 0; i < 60; i++) minsSecsHTML += `<div>${i.toString().padStart(2, '0')}</div>`;
    
    hoursWheel.innerHTML = hoursHTML;
    minsWheel.innerHTML = minsSecsHTML;
    secsWheel.innerHTML = minsSecsHTML;
}

function getRowHeight() {
    const activeDocument = widget.ownerDocument || document;
    if (activeDocument !== document) {
        return 60; 
    }
    const isMobileLayout = window.matchMedia("(max-width: 768px)").matches;
    return isMobileLayout ? 60 : 80;
}

function updateRollingDisplay() {
    // Failsafe: Ensures math strictly never calculates backwards/negative pixel matrices 
    const safeTimeLeft = Math.max(timeLeft, 0);
    const hours = Math.floor(safeTimeLeft / 3600);
    const minutes = Math.floor((safeTimeLeft % 3600) / 60);
    const seconds = safeTimeLeft % 60;

    const rowHeight = getRowHeight();

    hoursWheel.style.transform = `translateY(-${hours * rowHeight}px)`;
    minsWheel.style.transform = `translateY(-${minutes * rowHeight}px)`;
    secsWheel.style.transform = `translateY(-${seconds * rowHeight}px)`;

    const hStr = hours.toString().padStart(2, '0');
    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');
    document.title = `(${hStr}:${mStr}:${sStr}) Lockd In`;
}

// --- TRUE REAL-TIME GLOBAL CLOUD VISITOR COUNTER ENGINE ---
async function processUniquePlatformVisits() {
    let hasBeenCounted = localStorage.getItem('lockdIn_countedOnPlatform');
    const workspaceKey = "ekddesigns_lockdin_workspace";
    const metricKey = "unique_builders_joined";

    const cachedCount = parseInt(localStorage.getItem('lockdIn_lastKnownCount'));
    if (!isNaN(cachedCount) && cachedCount > 0) {
        const activeDocument = widget.ownerDocument || document;
        const currentCounterNode = activeDocument.getElementById('globalVisitorCount') || globalVisitorCount;
        if (currentCounterNode) {
            currentCounterNode.textContent = cachedCount.toString().padStart(3, '0');
        }
    }

    const fetchGlobalMetrics = async (incrementData = false) => {
        try {
            const url = incrementData
                ? `https://api.counterapi.dev/v1/${workspaceKey}/${metricKey}/up`
                : `https://api.counterapi.dev/v1/${workspaceKey}/${metricKey}`;

            const response = await fetch(url);
            const data = await response.json();
            const globalTotal = data.count || 1;

            localStorage.setItem('lockdIn_lastKnownCount', globalTotal);

            const activeDocument = widget.ownerDocument || document;
            const currentCounterNode = activeDocument.getElementById('globalVisitorCount') || globalVisitorCount;
            if (currentCounterNode) {
                currentCounterNode.textContent = globalTotal.toString().padStart(3, '0');
            }

            if (globalTotal >= 100) {
                triggerMegaMilestoneCelebration(globalTotal);
            }
        } catch (error) {
            console.warn("Global network synchronization dropped.", error);
            const lastKnown = parseInt(localStorage.getItem('lockdIn_lastKnownCount'));
            if (!isNaN(lastKnown) && lastKnown > 0) {
                const activeDocument = widget.ownerDocument || document;
                const currentCounterNode = activeDocument.getElementById('globalVisitorCount') || globalVisitorCount;
                if (currentCounterNode) {
                    currentCounterNode.textContent = lastKnown.toString().padStart(3, '0');
                }
            }
        }
    };

    if (!hasBeenCounted) {
        await fetchGlobalMetrics(true);
        localStorage.setItem('lockdIn_countedOnPlatform', 'true');
    } else {
        await fetchGlobalMetrics(false);
    }

    setInterval(async () => {
        await fetchGlobalMetrics(false);
    }, 60000);
}

function triggerMegaMilestoneCelebration(count) {
    widgetCelebrationOverlay.innerHTML = `🎉<div style="font-size: 1.2rem; font-family:'Space Grotesk'; margin-top:10px;">${count} BUILDERS JOINED!</div>`;
    widgetCelebrationOverlay.classList.add('celebrate-active');
    
    setTimeout(() => {
        widgetCelebrationOverlay.classList.remove('celebrate-active');
        widgetCelebrationOverlay.innerHTML = `🏆`; 
    }, 5000);
}

// --- Persistent Tabular Logging System ---
function commitLogToTerminal(type, targetDurationSeconds, completedOption, isPreloaded = false) {
    if (!isPreloaded && type !== null) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const logEntry = { timestamp, type, targetDurationSeconds, completedOption };
        historicalLogsStack.unshift(logEntry);
        localStorage.setItem('lockdIn_terminalLogs', JSON.stringify(historicalLogsStack));
    }
    renderLogsUI();
}

// --- Dynamic Profile Glass Card Metrics Calculation Engine ---
function renderProfileCardData() {
    const activeDocument = widget.ownerDocument || document;
    const innerSelector = activeDocument.getElementById('cardTimelineSelector') || cardTimelineSelector;
    const innerLabel = activeDocument.getElementById('cardTimelineLabel') || cardTimelineLabel;
    const innerDisplay = activeDocument.getElementById('cardMetricsDisplay') || cardMetricsDisplay;
    const innerBadge = activeDocument.getElementById('cardTrophyBadge') || cardTrophyBadge;

    if (!innerSelector || !innerDisplay) return;

    const timelineKey = innerSelector.value; 
    const items = metricsDatabase[timelineKey];

    let totalMinutes = 0;
    if (timelineKey === 'daily') {
        const currentDayIndex = new Date().getDay();
        totalMinutes = items[currentDayIndex].mins;
    } else {
        totalMinutes = items.reduce((sum, current) => sum + current.mins, 0);
    }

    const totalHours = (totalMinutes / 60).toFixed(1);

    if (innerLabel) innerLabel.textContent = `${timelineKey.charAt(0).toUpperCase() + timelineKey.slice(1)} Focus`;
    innerDisplay.textContent = `${totalHours} hrs`;
    if (innerBadge) innerBadge.textContent = `${totalTrophies} Trophies 🏆`;
}

// --- html2canvas Core Image Generation Downloader Engine ---
async function downloadProfileCardAsJpg() {
    renderProfileCardData();
    try {
        const canvas = await html2canvas(profileCardCanvasFrame, {
            scale: 2, 
            backgroundColor: "#050505",
            logging: false,
            useCORS: true 
        });

        const imageURL = canvas.toDataURL("image/jpeg", 0.95); 
        const virtualAnchor = document.createElement('a');
        const activeRange = (cardTimelineSelector.value || "focus").toLowerCase();
        
        virtualAnchor.href = imageURL;
        virtualAnchor.download = `LockdIn_ProfileCard_${activeRange}.jpg`;
        document.body.appendChild(virtualAnchor);
        virtualAnchor.click();
        document.body.removeChild(virtualAnchor);
        
    } catch (err) {
        console.error("Canvas export rendering failed.", err);
    }
}

function renderLogsUI() {
    const activeDocument = widget.ownerDocument || document;
    const logBody = activeDocument.getElementById('terminalLogBody') || terminalLogBody;
    
    if (logBody) {
        if (historicalLogsStack.length > 0) {
            logBody.innerHTML = '';
            historicalLogsStack.forEach(log => {
                const durationMinutes = Math.round(log.targetDurationSeconds / 60);
                const modeLabel = log.type === 'focus' ? 'Lock In Session' : 'Rest Break';
                const tagClass = log.completedOption ? 'complete' : 'interrupted';
                const tagLabel = log.completedOption ? 'Completed' : 'Interrupted';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${log.timestamp}</td>
                    <td><strong>${modeLabel}</strong></td>
                    <td>${durationMinutes} mins</td>
                    <td><span class="status-tag ${tagClass}">${tagLabel}</span></td>
                `;
                logBody.appendChild(row);
            });
        } else {
            logBody.innerHTML = `
                <tr class="empty-row-notice">
                    <td colspan="4">No historical telemetry compiled in terminal stack yet.</td>
                </tr>
            `;
        }
    }
}

function renderProductivityCharts() {
    const activeDocument = widget.ownerDocument || document;
    const chartContainer = activeDocument.getElementById('barChartContainer') || barChartContainer;
    const selector = activeDocument.getElementById('chartTimelineSelector') || chartTimelineSelector;
    
    if (chartContainer && selector) {
        const selectKey = selector.value;
        const items = metricsDatabase[selectKey];
        const maxMins = Math.max(...items.map(i => i.mins), 1);
        chartContainer.innerHTML = '';

        items.forEach((item, idx) => {
            const heightPercentage = (item.mins / maxMins) * 100;
            const column = document.createElement('div');
            column.classList.add('chart-bar-column');

            const isActive = idx === items.length - 1 ? 'active-bar' : '';
            column.innerHTML = `
                <div class="chart-bar-fill ${isActive}" style="height: ${heightPercentage}%" title="${item.mins} focused minutes"></div>
                <div class="chart-bar-label">${item.label}</div>
            `;
            chartContainer.appendChild(column);
        });
    }
}

function triggerTrophyCelebration() {
    widgetCelebrationOverlay.classList.add('celebrate-active');
    setTimeout(() => widgetCelebrationOverlay.classList.remove('celebrate-active'), 2400);
}

function getTargetCabinet() {
    const activeDocument = widget.ownerDocument || document;
    return activeDocument.getElementById('trophyCabinet') || trophyCabinet;
}

function renderTrophiesUI() {
    const targetCabinet = getTargetCabinet();
    if (targetCabinet) {
        if (totalTrophies > 0) {
            targetCabinet.innerHTML = '';
            for (let i = 0; i < totalTrophies; i++) {
                const trophy = document.createElement('span');
                trophy.classList.add('trophy-emoji');
                trophy.textContent = '🏆';
                targetCabinet.appendChild(trophy);
            }
        } else {
            targetCabinet.innerHTML = `<div class="empty-cabinet-text">No milestones locked in yet. Complete a session!</div>`;
        }
    }
}

function grantFocusTrophy() {
    totalTrophies++;
    localStorage.setItem('lockdIn_trophyCount', totalTrophies);
    renderTrophiesUI();

    const currentDayIndex = new Date().getDay(); 
    metricsDatabase.daily[currentDayIndex].mins += Math.round(currentSessionTotalTarget / 60);
    metricsDatabase.weekly[4].mins += Math.round(currentSessionTotalTarget / 60);
    
    localStorage.setItem('lockdIn_metricsDatabase', JSON.stringify(metricsDatabase));
    renderProductivityCharts();
    renderProfileCardData(); 
}

function switchMode(wasGracefullyCompleted = true) {
    commitLogToTerminal(currentMode, currentSessionTotalTarget, wasGracefullyCompleted);

    if (currentMode === 'focus') {
        if (wasGracefullyCompleted) {
            grantFocusTrophy();
            triggerTrophyCelebration();
            focusEndSound.currentTime = 0;
            focusEndSound.play().catch(e => console.log('Audio error:', e));
        }
        currentMode = 'rest';
        timeLeft = selectedRestDuration;
        currentSessionTotalTarget = selectedRestDuration;
    } else {
        if (wasGracefullyCompleted) {
            restEndSound.currentTime = 0;
            restEndSound.play().catch(e => console.log('Audio error:', e));
        }
        currentMode = 'focus';
        timeLeft = selectedFocusDuration;
        currentSessionTotalTarget = selectedFocusDuration;
    }
    
    saveTimerStateToLocalStorage();
    updateModeUIContext();
    updateRollingDisplay();
}

function updateModeUIContext() {
    const activeDocument = widget.ownerDocument || document;
    const innerStartBtn = activeDocument.getElementById('startBtn') || startBtn;
    const innerStateIndicator = activeDocument.getElementById('stateIndicator') || stateIndicator;
    const innerInlineDisplay = activeDocument.getElementById('inlineTaskDisplay') || inlineTaskDisplay;
    const innerTaskContainer = activeDocument.getElementById('taskSpaceContainer') || taskSpaceContainer;

    const savedTaskText = localStorage.getItem('lockdIn_activeTaskGoal') || '';

    if (innerStateIndicator) {
        innerStateIndicator.textContent = currentMode === 'focus' ? "Lockd in" : "Resting";
    }

    if (currentMode === 'focus') {
        if (innerStartBtn) innerStartBtn.textContent = isRunning ? "Pause" : "Start";
    } else {
        if (innerStartBtn) innerStartBtn.textContent = isRunning ? "Pause" : "Start Rest";
    }

    if (isRunning) {
        if (innerTaskContainer) innerTaskContainer.style.display = 'none';
        if (innerInlineDisplay) {
            if (savedTaskText.trim() !== '') {
                innerInlineDisplay.textContent = savedTaskText;
                innerInlineDisplay.style.display = 'inline-block';
            } else {
                innerInlineDisplay.style.display = 'none';
            }
        }
    } else {
        if (innerTaskContainer) innerTaskContainer.style.display = 'block';
        if (innerInlineDisplay) innerInlineDisplay.style.display = 'none';
    }
}

function tick() {
    if (timeLeft > 0) {
        timeLeft--;
        localStorage.setItem('lockdIn_timeLeft', timeLeft); 
        updateRollingDisplay();
    } else {
        switchMode(true);
        // Do NOT blindly call toggleTimer() here, which recursively fights itself and turns the tracker OFF. 
        // Simply let the active setInterval heart pulse continue tracking the *newly* rotated timeLeft integer!
        saveTimerStateToLocalStorage();
    }
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timer);
        isRunning = false;
        updateModeUIContext();
        saveTimerStateToLocalStorage();
    } else {
        timer = setInterval(tick, 1000);
        isRunning = true;
        updateModeUIContext();
        saveTimerStateToLocalStorage();
    }
}

function goToNextInterval() {
    clearInterval(timer);
    const wasActivelyCounting = isRunning;
    isRunning = false;
    switchMode(false);
    
    if (wasActivelyCounting) {
        toggleTimer(); 
    }
}

function triggerResetLogic() {
    resetClickCount++;
    if (resetClickTimeout) clearTimeout(resetClickTimeout);
    resetClickTimeout = setTimeout(() => { resetClickCount = 0; }, 2500);

    if (resetClickCount === 1) {
        clearInterval(timer);
        isRunning = false;
        timeLeft = currentSessionTotalTarget;
        saveTimerStateToLocalStorage();
        updateModeUIContext();
        updateRollingDisplay();
    } else if (resetClickCount === 3) {
        clearInterval(timer);
        isRunning = false;
        updateModeUIContext();
        
        const isUserCertain = confirm("Are you sure you want to hard reset your workspace? This will permanently wipe your metrics, logs, and achieved milestones.");
        
        if (isUserCertain) {
            const countedToken = localStorage.getItem('lockdIn_countedOnPlatform');
            localStorage.clear();
            if (countedToken) localStorage.setItem('lockdIn_countedOnPlatform', countedToken);

            currentMode = 'focus';
            selectedFocusDuration = 180 * 60;
            selectedRestDuration = 5 * 60;
            timeLeft = selectedFocusDuration;
            currentSessionTotalTarget = selectedFocusDuration;
            totalTrophies = 0;
            historicalLogsStack = [];

            Object.keys(metricsDatabase).forEach(key => {
                metricsDatabase[key].forEach(item => item.mins = 0);
            });

            saveTimerStateToLocalStorage();

            document.querySelectorAll('.config-card').forEach(card => card.classList.remove('active'));
            const defaultFocusCard = document.querySelector('#focusConfig .config-card[data-time="180"]');
            const defaultRestCard = document.querySelector('#restConfig .config-card[data-time="5"]');
            if (defaultFocusCard) defaultFocusCard.classList.add('active');
            if (defaultRestCard) defaultRestCard.classList.add('active');
            
            const activeDocument = widget.ownerDocument || document;
            const innerInputField = activeDocument.getElementById('taskInputField') || taskInputField;
            if (innerInputField) innerInputField.value = '';

            updateModeUIContext();
            updateRollingDisplay();
            renderTrophiesUI();
            renderLogsUI();
            renderProductivityCharts();
            renderProfileCardData();
            
            resetClickCount = 0;
        } else {
            resetClickCount = 0;
            recoverActiveTimerState();
            updateRollingDisplay();
        }
    }
}

// SAFER RECOVERY LOOP LOGIC:
function recoverActiveTimerState() {
    if (isRunning) {
        const expectedEnd = localStorage.getItem('lockdIn_expectedEndTime');
        if (expectedEnd && expectedEnd !== "undefined" && !isNaN(expectedEnd)) {
            let dynamicDifference = Math.round((parseInt(expectedEnd) - Date.now()) / 1000);

            if (dynamicDifference > 0) {
                timeLeft = dynamicDifference;
            } else {
                pendingCompletionSound = currentMode === 'focus' ? 'focus' : 'rest';
                if (currentMode === 'focus') {
                    grantFocusTrophy();
                    triggerTrophyCelebration();
                }
                timeLeft = 0;
                switchMode(false);
                setupDeferredSoundPlayback();
                return;
            }
        }
        timer = setInterval(tick, 1000);
    }
}

function setupDeferredSoundPlayback() {
    function playPendingSound() {
        if (!pendingCompletionSound) return;
        const sound = pendingCompletionSound === 'focus' ? focusEndSound : restEndSound;
        sound.currentTime = 0;
        sound.play().catch(e => console.log('Audio error:', e));
        pendingCompletionSound = null;
        document.removeEventListener('click', playPendingSound);
        document.removeEventListener('keydown', playPendingSound);
        document.removeEventListener('touchstart', playPendingSound);
    }
    document.addEventListener('click', playPendingSound, { once: true });
    document.addEventListener('keydown', playPendingSound, { once: true });
    document.addEventListener('touchstart', playPendingSound, { once: true });
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) {
        const expectedEnd = localStorage.getItem('lockdIn_expectedEndTime');
        if (expectedEnd && expectedEnd !== "undefined" && !isNaN(expectedEnd)) {
            let dynamicDifference = Math.round((parseInt(expectedEnd) - Date.now()) / 1000);
            if (dynamicDifference <= 0) {
                timeLeft = 0;
                switchMode(true);
                saveTimerStateToLocalStorage();
            } else {
                timeLeft = dynamicDifference;
            }
            updateRollingDisplay();
        }
    }
});

function setupConfigSelectors() {
    document.querySelectorAll('#focusConfig .config-card').forEach(card => {
        if (parseInt(card.dataset.time) * 60 === selectedFocusDuration) {
            document.querySelectorAll('#focusConfig .config-card').forEach(b => b.classList.remove('active'));
            card.classList.add('active');
        }
    });

    document.querySelectorAll('#restConfig .config-card').forEach(card => {
        if (parseInt(card.dataset.time) * 60 === selectedRestDuration) {
            document.querySelectorAll('#restConfig .config-card').forEach(b => b.classList.remove('active'));
            card.classList.add('active');
        }
    });

    document.getElementById('focusConfig').addEventListener('click', (e) => {
        const card = e.target.closest('.config-card');
        if (!card || isRunning) return;
        
        document.querySelectorAll('#focusConfig .config-card').forEach(b => b.classList.remove('active'));
        card.classList.add('active');
        
        selectedFocusDuration = parseInt(card.dataset.time) * 60;
        localStorage.setItem('lockdIn_selectedFocus', selectedFocusDuration);
        
        if (currentMode === 'focus') {
            timeLeft = selectedFocusDuration;
            currentSessionTotalTarget = selectedFocusDuration;
            saveTimerStateToLocalStorage();
            updateRollingDisplay();
        }
    });

    document.getElementById('restConfig').addEventListener('click', (e) => {
        const card = e.target.closest('.config-card');
        if (!card || isRunning) return;
        
        document.querySelectorAll('#restConfig .config-card').forEach(b => b.classList.remove('active'));
        card.classList.add('active');
        
        selectedRestDuration = parseInt(card.dataset.time) * 60;
        localStorage.setItem('lockdIn_selectedRest', selectedRestDuration);
        
        if (currentMode === 'rest') {
            timeLeft = selectedRestDuration;
            currentSessionTotalTarget = selectedRestDuration;
            saveTimerStateToLocalStorage();
            updateRollingDisplay();
        }
    });

    taskInputField.value = localStorage.getItem('lockdIn_activeTaskGoal') || '';
    taskInputField.addEventListener('input', (e) => {
        localStorage.setItem('lockdIn_activeTaskGoal', e.target.value);
        updateModeUIContext();
    });

    chartTimelineSelector.addEventListener('change', renderProductivityCharts);
    
    if (cardTimelineSelector) cardTimelineSelector.addEventListener('change', renderProfileCardData);
    if (downloadCardBtn) downloadCardBtn.addEventListener('click', downloadProfileCardAsJpg);
}

function applyLoadedTheme() {
    if (isLightMode) {
        document.body.classList.replace('dark-mode', 'light-mode');
        themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    } else {
        document.body.classList.replace('light-mode', 'dark-mode');
        themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
    }
}

function toggleTheme() {
    isLightMode = !isLightMode;
    localStorage.setItem('lockdIn_lightMode', isLightMode);
    applyLoadedTheme();
}

async function togglePiP() {
    if (!('documentPictureInPicture' in window)) {
        alert("This browser workspace environment does not support Document PiP popouts yet. Use Chrome or Edge.");
        return;
    }
    if (window.documentPictureInPicture.window) return;

    const currentCachedTask = localStorage.getItem('lockdIn_activeTaskGoal') || '';

    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 380, height: 350 });

    [...document.styleSheets].forEach((styleSheet) => {
        try {
            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pipWindow.document.head.appendChild(style);
        } catch (e) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = styleSheet.href;
            pipWindow.document.head.appendChild(link);
        }
    });

    pipWindow.document.body.className = isLightMode ? 'light-mode pip-mode' : 'dark-mode pip-mode';
    pipWindow.document.body.appendChild(widget);

    const pipStartBtn = pipWindow.document.getElementById('startBtn');
    const pipNextBtn = pipWindow.document.getElementById('nextBtn');
    const pipResetBtn = pipWindow.document.getElementById('resetBtn');
    const pipTaskInput = pipWindow.document.getElementById('taskInputField');
    
    if (pipStartBtn) pipStartBtn.addEventListener('click', toggleTimer);
    if (pipNextBtn) pipNextBtn.addEventListener('click', goToNextInterval);
    if (pipResetBtn) pipResetBtn.addEventListener('click', triggerResetLogic);
    if (pipTaskInput) {
        pipTaskInput.value = currentCachedTask;
        pipTaskInput.addEventListener('input', (e) => {
            localStorage.setItem('lockdIn_activeTaskGoal', e.target.value);
            taskInputField.value = e.target.value; 
            updateModeUIContext();
        });
    }

    setTimeout(updateRollingDisplay, 100);

    pipWindow.addEventListener('pagehide', () => {
        const workspace = document.querySelector('.upper-control-station');
        workspace.insertBefore(widget, workspace.firstChild);
        
        taskInputField.value = localStorage.getItem('lockdIn_activeTaskGoal') || '';
        updateModeUIContext();
        updateRollingDisplay();
    });
}

window.addEventListener('resize', updateRollingDisplay);

// --- Event Subscriptions Linkage ---
startBtn.addEventListener('click', toggleTimer);
nextBtn.addEventListener('click', goToNextInterval);
resetBtn.addEventListener('click', triggerResetLogic);
themeToggle.addEventListener('click', toggleTheme);
pipBtn.addEventListener('click', togglePiP);

// Bootstrap rendering initialization startup sequences
initializeWheels();
setupConfigSelectors();
updateModeUIContext();
recoverActiveTimerState(); 
updateRollingDisplay();
renderProductivityCharts();
commitLogToTerminal(null, null, null, true); 
renderTrophiesUI();
applyLoadedTheme();
processUniquePlatformVisits();
renderProfileCardData();
