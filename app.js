// --- Core Analytics & Persistent Database Variables (LocalStorage Driven) ---
let timer;
let isRunning = localStorage.getItem('lockdIn_isRunning') === 'true';
let currentMode = localStorage.getItem('lockdIn_currentMode') || 'focus'; 
let isLightMode = localStorage.getItem('lockdIn_lightMode') === 'true';

// Default Fallbacks: 3 Hours focus (180 mins) & 5 Mins rest (5 mins)
let selectedFocusDuration = parseInt(localStorage.getItem('lockdIn_selectedFocus')) || 180 * 60; 
let selectedRestDuration = parseInt(localStorage.getItem('lockdIn_selectedRest')) || 5 * 60;
let timeLeft = parseInt(localStorage.getItem('lockdIn_timeLeft')) || selectedFocusDuration;
let currentSessionTotalTarget = parseInt(localStorage.getItem('lockdIn_totalTarget')) || selectedFocusDuration;

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
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;

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
    
    const fetchGlobalMetrics = async (incrementData = false) => {
        try {
            const url = incrementData 
                ? `https://api.counterapi.dev/v1/${workspaceKey}/${metricKey}/up`
                : `https://api.counterapi.dev/v1/${workspaceKey}/${metricKey}`;
                
            const response = await fetch(url);
            const data = await response.json();
            const globalTotal = data.count || 1;
            
            globalVisitorCount.textContent = globalTotal.toString().padStart(3, '0');
            
            if (globalTotal >= 100) {
                triggerMegaMilestoneCelebration(globalTotal);
            }
        } catch (error) {
            console.warn("Global network synchronization dropped.", error);
            let fallbackSeed = parseInt(localStorage.getItem('lockdIn_networkTrafficSeed')) || 1;
            if (incrementData) {
                fallbackSeed++;
                localStorage.setItem('lockdIn_networkTrafficSeed', fallbackSeed);
            }
            globalVisitorCount.textContent = fallbackSeed.toString().padStart(3, '0');
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
    }, 10000);
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

// DYNAMIC TASK SPACE REFACTOR VISIBILITY CONTROLLER:
function updateModeUIContext() {
    const activeDocument = widget.ownerDocument || document;
    const innerStartBtn = activeDocument.getElementById('startBtn') || startBtn;
    const innerStateIndicator = activeDocument.getElementById('stateIndicator') || stateIndicator;
    const innerInlineDisplay = activeDocument.getElementById('inlineTaskDisplay') || inlineTaskDisplay;
    const innerTaskContainer = activeDocument.getElementById('taskSpaceContainer') || taskSpaceContainer;

    const savedTaskText = localStorage.getItem('lockdIn_activeTaskGoal') || '';

    // Header Mode Updates
    if (innerStateIndicator) {
        innerStateIndicator.textContent = currentMode === 'focus' ? "Lockd in" : "Resting";
    }

    if (currentMode === 'focus') {
        if (innerStartBtn) innerStartBtn.textContent = isRunning ? "Pause" : "Start";
    } else {
        if (innerStartBtn) innerStartBtn.textContent = isRunning ? "Pause" : "Start Rest";
    }

    // Task Space Disappearing & Inline Binding Engine
    if (isRunning) {
        // Timer counting -> Hide text write box area completely, render beside header text
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
        // Timer paused -> Bring back write space box area cleanly, wipe upper display track
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
        // Continuous loop iteration transfer engine parameter
        switchMode(true);
        toggleTimer(); 
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
            
            resetClickCount = 0;
        } else {
            resetClickCount = 0;
            recoverActiveTimerState();
            updateRollingDisplay();
        }
    }
}

function recoverActiveTimerState() {
    if (isRunning) {
        const expectedEnd = localStorage.getItem('lockdIn_expectedEndTime');
        if (expectedEnd) {
            let dynamicDifference = Math.round((parseInt(expectedEnd) - Date.now()) / 1000);
            
            while (dynamicDifference <= 0) {
                switchMode(true);
                dynamicDifference = Math.round((parseInt(localStorage.getItem('lockdIn_expectedEndTime')) - Date.now()) / 1000);
            }
            
            timeLeft = dynamicDifference;
            timer = setInterval(tick, 1000);
        } else {
            timer = setInterval(tick, 1000);
        }
    }
}

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
    const pipTaskInput = pipWindow.document.getElementById('taskInputField');
    
    if (pipStartBtn) pipStartBtn.addEventListener('click', toggleTimer);
    if (pipTaskInput) {
        pipTaskInput.value = currentCachedTask;
        pipTaskInput.addEventListener('input', (e) => {
            localStorage.setItem('lockdIn_activeTaskGoal', e.target.value);
            taskInputField.value = e.target.value; // Mirror back to desktop window channel parameters safely
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
