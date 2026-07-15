// --- Core Analytics & Persistent Database Variables (LocalStorage Driven) ---
let timer;
let isRunning = localStorage.getItem('lockdIn_isRunning') === 'true';
let currentMode = localStorage.getItem('lockdIn_currentMode') || 'focus'; 
let isLightMode = localStorage.getItem('lockdIn_lightMode') === 'true';

let selectedFocusDuration = parseInt(localStorage.getItem('lockdIn_selectedFocus')) || 15 * 60;
let selectedRestDuration = parseInt(localStorage.getItem('lockdIn_selectedRest')) || 180 * 60;
let timeLeft = parseInt(localStorage.getItem('lockdIn_timeLeft')) || selectedFocusDuration;
let currentSessionTotalTarget = parseInt(localStorage.getItem('lockdIn_totalTarget')) || selectedFocusDuration;

let totalTrophies = parseInt(localStorage.getItem('lockdIn_trophyCount')) || 0;
let historicalLogsStack = JSON.parse(localStorage.getItem('lockdIn_terminalLogs')) || [];

// Wiped clean - maps genuine history from zero boundaries
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
const pipBtn = document.getElementById('pipBtn');
const stateIndicator = document.getElementById('stateIndicator');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const widget = document.getElementById('widget');
const trophyCabinet = document.getElementById('trophyCabinet');
const terminalLogBody = document.getElementById('terminalLogBody');
const barChartContainer = document.getElementById('barChartContainer');
const chartTimelineSelector = document.getElementById('chartTimelineSelector');
const widgetCelebrationOverlay = document.getElementById('widgetCelebrationOverlay');
const globalVisitorCount = document.getElementById('globalVisitorCount');

// Audio nodes
const focusEndSound = document.getElementById('focusEndSound');
const restEndSound = document.getElementById('restEndSound');

// Wheels
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

// Get the active variable row height from stylesheet to prevent sliding translations mismatch
function getRowHeight() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 80;
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

// --- Unique Network Visitor Verification Engine ---
function processUniquePlatformVisits() {
    let hasVisitedBeforeToken = localStorage.getItem('lockdIn_returningUserToken');

    if (!hasVisitedBeforeToken) {
        localStorage.setItem('lockdIn_returningUserToken', 'true');
        globalVisitorCount.textContent = "001";
    } else {
        globalVisitorCount.textContent = "001";
    }
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
    if (historicalLogsStack.length > 0) {
        const placeholder = document.querySelector('.empty-row-notice');
        if (placeholder) placeholder.remove();
        
        terminalLogBody.innerHTML = '';
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
            terminalLogBody.appendChild(row);
        });
    }
}

// --- Dynamic Graphical Analytics Generator ---
function renderProductivityCharts() {
    const selectKey = chartTimelineSelector.value;
    const items = metricsDatabase[selectKey];
    const maxMins = Math.max(...items.map(i => i.mins), 1);
    barChartContainer.innerHTML = '';

    items.forEach((item, idx) => {
        const heightPercentage = (item.mins / maxMins) * 100;
        const column = document.createElement('div');
        column.classList.add('chart-bar-column');

        const isActive = idx === items.length - 1 ? 'active-bar' : '';
        column.innerHTML = `
            <div class="chart-bar-fill ${isActive}" style="height: ${heightPercentage}%" title="${item.mins} focused minutes"></div>
            <div class="chart-bar-label">${item.label}</div>
        `;
        barChartContainer.appendChild(column);
    });
}

function triggerTrophyCelebration() {
    widgetCelebrationOverlay.classList.add('celebrate-active');
    setTimeout(() => widgetCelebrationOverlay.classList.remove('celebrate-active'), 2400);
}

function renderTrophiesUI() {
    if (totalTrophies > 0) {
        trophyCabinet.innerHTML = '';
        for (let i = 0; i < totalTrophies; i++) {
            const trophy = document.createElement('span');
            trophy.classList.add('trophy-emoji');
            trophy.textContent = '🏆';
            trophyCabinet.appendChild(trophy);
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

// --- Central Mode Rotator Routine Loop ---
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
    if (currentMode === 'focus') {
        stateIndicator.textContent = "Lockd in";
        startBtn.textContent = isRunning ? "Pause" : "Lock In";
    } else {
        stateIndicator.textContent = "Resting";
        startBtn.textContent = isRunning ? "Pause" : "Start Rest";
    }
}

function tick() {
    if (timeLeft > 0) {
        timeLeft--;
        localStorage.setItem('lockdIn_timeLeft', timeLeft); 
        updateRollingDisplay();
    } else {
        clearInterval(timer);
        isRunning = false;
        switchMode(true);
    }
}

// --- Operational Click Controls ---
function toggleTimer() {
    if (isRunning) {
        clearInterval(timer);
        isRunning = false;
        updateModeUIContext();
        saveTimerStateToLocalStorage();
    } else {
        timer = setInterval(tick, 1000);
        isRunning = true;
        startBtn.textContent = "Pause";
        saveTimerStateToLocalStorage();
    }
}

function goToNextInterval() {
    clearInterval(timer);
    const wasInterrupted = isRunning || (timeLeft < currentSessionTotalTarget);
    isRunning = false;
    switchMode(!wasInterrupted);
}

// --- System Engine Dynamic Bootstrapping Recovery ---
function recoverActiveTimerState() {
    if (isRunning) {
        const expectedEnd = localStorage.getItem('lockdIn_expectedEndTime');
        if (expectedEnd) {
            const dynamicDifference = Math.round((parseInt(expectedEnd) - Date.now()) / 1000);
            
            if (dynamicDifference > 0) {
                timeLeft = dynamicDifference;
                timer = setInterval(tick, 1000);
            } else {
                timeLeft = 0;
                switchMode(true);
            }
        } else {
            timer = setInterval(tick, 1000);
        }
    }
}

// --- Card Selection Configurations Engine Setup ---
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

    chartTimelineSelector.addEventListener('change', renderProductivityCharts);
}

// --- UI Workspace Theme Shifter ---
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

// --- Document Picture-in-Picture API Engine ---
async function togglePiP() {
    if (!('documentPictureInPicture' in window)) {
        alert("This browser workspace environment does not support Document PiP popouts yet. Use Chrome or Edge.");
        return;
    }
    if (window.documentPictureInPicture.window) return;

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

    pipWindow.addEventListener('pagehide', () => {
        const workspace = document.querySelector('.upper-control-station');
        workspace.insertBefore(widget, workspace.firstChild);
    });
}

// --- Recalculate dimensions on viewport resize events to protect transition translations layout heights ---
window.addEventListener('resize', updateRollingDisplay);

// --- Event Subscriptions Linkage ---
startBtn.addEventListener('click', toggleTimer);
nextBtn.addEventListener('click', goToNextInterval);
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
