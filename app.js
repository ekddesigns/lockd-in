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

let historicalLogsStack = JSON.parse(localStorage.getItem('lockdIn_terminalLogs')) || [];

// Database Schema: tracks mins and trophies for daily, weekly, monthly
let metricsDatabase = JSON.parse(localStorage.getItem('lockdIn_metricsDatabase')) || {
    daily: [
        { label: 'Sun', mins: 0, trophies: 0 }, { label: 'Mon', mins: 0, trophies: 0 }, { label: 'Tue', mins: 0, trophies: 0 },
        { label: 'Wed', mins: 0, trophies: 0 }, { label: 'Thu', mins: 0, trophies: 0 }, { label: 'Fri', mins: 0, trophies: 0 }, { label: 'Sat', mins: 0, trophies: 0 }
    ],
    weekly: [
        { label: 'Wk 1', mins: 0, trophies: 0 }, { label: 'Wk 2', mins: 0, trophies: 0 }, { label: 'Wk 3', mins: 0, trophies: 0 },
        { label: 'Wk 4', mins: 0, trophies: 0 }, { label: 'Wk 5', mins: 0, trophies: 0 }
    ],
    monthly: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(label => ({ label, mins: 0, trophies: 0 }))
};

// SCHEMA MIGRATION: older saved data only had 5 fixed monthly slots (Jan-May) and
// was never actually written to, which is why monthly totals never calculated.
// Upgrade any existing localStorage data to the full real 12-month schema.
if (!Array.isArray(metricsDatabase.monthly) || metricsDatabase.monthly.length !== 12) {
    metricsDatabase.monthly = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(label => ({ label, mins: 0, trophies: 0 }));
    localStorage.setItem('lockdIn_metricsDatabase', JSON.stringify(metricsDatabase));
}

// ONE-TIME BACKFILL: before this fix, monthly minutes/trophies were never written to at
// all, and weekly minutes were always funneled into a single hardcoded slot regardless of
// the real week. That old weekly total is the closest available record of real focus time
// already earned, so fold it into the current month's bucket once, then never touch it again.
if (!localStorage.getItem('lockdIn_monthlyBackfillDone')) {
    const currentMonthIdx = new Date().getMonth();
    const legacyMins = metricsDatabase.weekly.reduce((sum, w) => sum + (w.mins || 0), 0);
    const legacyTrophies = metricsDatabase.weekly.reduce((sum, w) => sum + (w.trophies || 0), 0);

    if (legacyMins > 0) {
        metricsDatabase.monthly[currentMonthIdx].mins += legacyMins;
        metricsDatabase.monthly[currentMonthIdx].trophies += legacyTrophies;
        localStorage.setItem('lockdIn_metricsDatabase', JSON.stringify(metricsDatabase));
    }
    localStorage.setItem('lockdIn_monthlyBackfillDone', 'true');
}

// --- Real-Calendar Index Helpers (used to keep daily/weekly/monthly buckets accurate) ---
function getCurrentDayIndex(dateObj = new Date()) { return dateObj.getDay(); }
function getCurrentWeekIndex(dateObj = new Date()) { return Math.min(4, Math.floor((dateObj.getDate() - 1) / 7)); }
function getCurrentMonthIndex(dateObj = new Date()) { return dateObj.getMonth(); }

function verifyDailyReset() {
    const now = new Date();
    const todayStr = now.toDateString();
    const storedDateStr = localStorage.getItem('lockdIn_lastDate');

    if (storedDateStr !== todayStr) {
        const lastDate = storedDateStr ? new Date(storedDateStr) : new Date();
        
        // 1. Detect Year Change -> Wipe Months, Weeks, and Days
        if (now.getFullYear() !== lastDate.getFullYear()) {
            metricsDatabase.monthly.forEach(m => { m.mins = 0; m.trophies = 0; });
            metricsDatabase.weekly.forEach(w => { w.mins = 0; w.trophies = 0; });
            metricsDatabase.daily.forEach(d => { d.mins = 0; d.trophies = 0; });
        } 
        // 2. Detect Month Change -> Wipe Weeks and Days
        else if (now.getMonth() !== lastDate.getMonth()) {
            metricsDatabase.weekly.forEach(w => { w.mins = 0; w.trophies = 0; });
            metricsDatabase.daily.forEach(d => { d.mins = 0; d.trophies = 0; });
        }
        // 3. Detect Week Change -> Wipe Days
        // We check if the day of the week is lower than the last day (e.g. going from Sat to Mon)
        // or if it's been more than 7 days since the last login.
        else {
            const timeDiff = now.getTime() - lastDate.getTime();
            const daysDiff = timeDiff / (1000 * 3600 * 24);
            
            if (now.getDay() < lastDate.getDay() || daysDiff >= 7) {
                metricsDatabase.daily.forEach(d => { d.mins = 0; d.trophies = 0; });
            }
        }

        // Always ensure the "Current Day" slot is fresh when the date changes
        const todayIdx = getCurrentDayIndex(now);
        metricsDatabase.daily[todayIdx].mins = 0;
        metricsDatabase.daily[todayIdx].trophies = 0;

        localStorage.setItem('lockdIn_lastDate', todayStr);
        localStorage.setItem('lockdIn_metricsDatabase', JSON.stringify(metricsDatabase));
    }
}
verifyDailyReset(); 


function renderStreakUI() {
    const activeDocument = widget.ownerDocument || document;
    const targetEl = activeDocument.getElementById('streakCount') || streakCountEl;
    if (targetEl) {
        targetEl.textContent = parseInt(localStorage.getItem('lockdIn_streakCount')) || 0;
    }
}

// Detects a missed day (opened the app, but no session was completed yesterday or today)
// and visually resets the streak to 0 without waiting for the next session to complete.
function verifyStreakIntegrity() {
    const todayStr = new Date().toDateString();
    const lastStreakDate = localStorage.getItem('lockdIn_lastStreakDate');

    if (lastStreakDate && lastStreakDate !== todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastStreakDate !== yesterday.toDateString()) {
            localStorage.setItem('lockdIn_streakCount', 0);
            localStorage.removeItem('lockdIn_lastStreakDate');
        }
    }
    renderStreakUI();
}

// Call this the moment a focus session completes gracefully to advance/continue/reset the streak
function updateStreakOnCompletion() {
    const todayStr = new Date().toDateString();
    const lastStreakDate = localStorage.getItem('lockdIn_lastStreakDate');

    if (lastStreakDate !== todayStr) {
        let streak = parseInt(localStorage.getItem('lockdIn_streakCount')) || 0;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        streak = (lastStreakDate === yesterday.toDateString()) ? streak + 1 : 1;

        localStorage.setItem('lockdIn_streakCount', streak);
        localStorage.setItem('lockdIn_lastStreakDate', todayStr);
    }
    renderStreakUI();
}

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
const streakCountEl = document.getElementById('streakCount');

// Profile Card Elements
const downloadCardBtn = document.getElementById('downloadCardBtn');
const cardTimelineSelector = document.querySelector('.profile-card-section #cardTimelineSelector');
const cardTimelineLabel = document.getElementById('cardTimelineLabel');
const cardActiveTask = document.getElementById('cardActiveTask');
const cardMetricsDisplay = document.getElementById('cardMetricsDisplay');
const cardTrophyBadge = document.getElementById('cardTrophyBadge');
const profileCardCanvasFrame = document.getElementById('profileCardCanvasFrame');

let resetClickCount = 0;
let resetClickTimeout;

// --- Self-Contained Notification Chime Engine (Web Audio API) ---
// Replaces the old external Mixkit <audio> files, whose URLs used an invalid
// path format and would silently 404, so no sound ever played. Generating the
// tones locally means notifications always work, with zero network dependency.
let audioCtx = null;

function warmUpAudio() {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.log('Audio warm-up error:', e);
    }
}

function playCompletionChime(type) {
    try {
        warmUpAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // Focus-complete: bright ascending 3-note chime. Rest-complete: soft 2-note descending tone.
        const notes = type === 'focus' ? [784, 988, 1244] : [523, 392];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.16;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// Plays when a session actually BEGINS (Start / Start Rest / Resume pressed) — deliberately
// different in character from the completion chimes above so start and finish never sound alike
function playStartChime(mode) {
    try {
        warmUpAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;

        if (mode === 'focus') {
            // Crisp, confident double-blip — "locking in"
            [660, 880].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                const start = now + i * 0.09;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(start);
                osc.stop(start + 0.13);
            });
        } else {
            // Single mellow, slow-fading tone — "settling into rest"
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 349.23; // F4
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.22, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 1);
        }
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// AUDIO UNLOCKER: Warms up the audio context upon first screen interaction so
// later programmatic playback (from setInterval-driven session completions) is allowed
document.body.addEventListener('click', warmUpAudio, { once: true });

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

            // Add strict cache-busting so browsers don't trap the user count fetch data
            const response = await fetch(url, { cache: 'no-store' });
            const data = await response.json();
            const globalTotal = data.count || 1;

            localStorage.setItem('lockdIn_lastKnownCount', globalTotal);

            const activeDocument = widget.ownerDocument || document;
            const currentCounterNode = activeDocument.getElementById('globalVisitorCount') || globalVisitorCount;
            if (currentCounterNode) {
                currentCounterNode.textContent = globalTotal.toString().padStart(3, '0');
            }

            if (globalTotal >= 10) {
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

// --- Persistent Tabular Logging System ---
function commitLogToTerminal(type, targetDurationSeconds, completedOption, isPreloaded = false) {
    if (!isPreloaded && type !== null) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Push the active task directly into the telemetry object logs if it's a work sequence
        const activeTaskCache = localStorage.getItem('lockdIn_activeTaskGoal') || '';
        const taskText = type === 'focus' ? (activeTaskCache.trim() !== '' ? activeTaskCache : '-') : '-';
        
        const logEntry = { timestamp, type, targetDurationSeconds, completedOption, task: taskText };
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
    const innerTask = activeDocument.getElementById('cardActiveTask') || cardActiveTask;
    const innerDisplay = activeDocument.getElementById('cardMetricsDisplay') || cardMetricsDisplay;
    const innerBadge = activeDocument.getElementById('cardTrophyBadge') || cardTrophyBadge;

    if (!innerSelector || !innerDisplay) return;

    const timelineKey = innerSelector.value; 
    const items = metricsDatabase[timelineKey];

    // Show the CURRENT bucket for whichever period is selected — matching "Today's
    // Milestones" behavior for daily, and naturally resetting when a new week/month begins
    let currentIdx;
    if (timelineKey === 'daily') currentIdx = getCurrentDayIndex();
    else if (timelineKey === 'weekly') currentIdx = getCurrentWeekIndex();
    else currentIdx = getCurrentMonthIndex();

    const totalMinutes = items[currentIdx].mins || 0;
    const localTotalTrophies = items[currentIdx].trophies || 0;

    const totalHours = (totalMinutes / 60).toFixed(1);
    
    const activeTaskString = localStorage.getItem('lockdIn_activeTaskGoal') || '';

    if (innerLabel) innerLabel.textContent = `${timelineKey.charAt(0).toUpperCase() + timelineKey.slice(1)} Focus`;
    if (innerTask) innerTask.textContent = activeTaskString.trim() !== '' ? activeTaskString : "No active task";
    innerDisplay.textContent = `${totalHours} hrs`;
    if (innerBadge) innerBadge.textContent = `${localTotalTrophies} Trophies 🏆`;
}

// --- html2canvas Core Image Generation Downloader Engine ---
async function downloadProfileCardAsJpg() {
    renderProfileCardData();
    
    // 1. Add the exporting class to the frame
    profileCardCanvasFrame.classList.add('is-exporting');

    try {
        // 2. Small delay to allow the browser to switch to the "clean" export look
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(profileCardCanvasFrame, {
            scale: 3, 
            backgroundColor: '#050505', 
            logging: false,
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: -window.scrollY, 
        });

        const imageURL = canvas.toDataURL("image/jpeg", 1.0); 
        const virtualAnchor = document.createElement('a');
        const activeRange = (cardTimelineSelector.value || "focus").toLowerCase();
        
        virtualAnchor.href = imageURL;
        virtualAnchor.download = `LockdIn_ProfileCard_${activeRange}.jpg`;
        document.body.appendChild(virtualAnchor);
        virtualAnchor.click();
        document.body.removeChild(virtualAnchor);
        
    } catch (err) {
        console.error("Canvas export rendering failed.", err);
    } finally {
        // 3. Remove the class so your website looks normal again on screen
        profileCardCanvasFrame.classList.remove('is-exporting');
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

        const now = new Date();
        let currentIdx;
        if (selectKey === 'daily') currentIdx = getCurrentDayIndex(now);
        else if (selectKey === 'weekly') currentIdx = getCurrentWeekIndex(now);
        else currentIdx = getCurrentMonthIndex(now);

        items.forEach((item, idx) => {
            const heightPercentage = (item.mins / maxMins) * 100;
            const column = document.createElement('div');
            column.classList.add('chart-bar-column');

            const isActive = idx === currentIdx ? 'active-bar' : '';
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
        const currentDayIndex = getCurrentDayIndex();
        const todaysTrophies = metricsDatabase.daily[currentDayIndex].trophies || 0;
        
        if (todaysTrophies > 0) {
            targetCabinet.innerHTML = '';
            for (let i = 0; i < todaysTrophies; i++) {
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
    verifyDailyReset();

    const now = new Date();
    const dayIdx = getCurrentDayIndex(now);
    const weekIdx = getCurrentWeekIndex(now);
    const monthIdx = getCurrentMonthIndex(now);
    const minsToAdd = Math.round(currentSessionTotalTarget / 60);

    // Distribute time and trophy increments across daily, weekly, and monthly buckets
    metricsDatabase.daily[dayIdx].mins += minsToAdd;
    metricsDatabase.daily[dayIdx].trophies = (metricsDatabase.daily[dayIdx].trophies || 0) + 1;

    metricsDatabase.weekly[weekIdx].mins += minsToAdd;
    metricsDatabase.weekly[weekIdx].trophies = (metricsDatabase.weekly[weekIdx].trophies || 0) + 1;

    metricsDatabase.monthly[monthIdx].mins += minsToAdd;
    metricsDatabase.monthly[monthIdx].trophies = (metricsDatabase.monthly[monthIdx].trophies || 0) + 1;

    localStorage.setItem('lockdIn_metricsDatabase', JSON.stringify(metricsDatabase));
    
    updateStreakOnCompletion();
    renderTrophiesUI();
    renderProductivityCharts();
    renderProfileCardData(); 
}

function switchMode(wasGracefullyCompleted = true) {
    commitLogToTerminal(currentMode, currentSessionTotalTarget, wasGracefullyCompleted);

    if (currentMode === 'focus') {
        if (wasGracefullyCompleted) {
            grantFocusTrophy();
            triggerTrophyCelebration();
            playCompletionChime('focus');
        }
        currentMode = 'rest';
        timeLeft = selectedRestDuration;
        currentSessionTotalTarget = selectedRestDuration;
    } else {
        if (wasGracefullyCompleted) {
            playCompletionChime('rest');
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
        playStartChime(currentMode);
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
            historicalLogsStack = [];

            Object.keys(metricsDatabase).forEach(key => {
                metricsDatabase[key].forEach(item => { item.mins = 0; item.trophies = 0; });
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
            renderStreakUI();
            
            resetClickCount = 0;
        } else {
            resetClickCount = 0;
            recoverActiveTimerState();
            updateRollingDisplay();
        }
    }
}

// SAFER RECOVERY LOOP LOGIC
function recoverActiveTimerState() {
    verifyDailyReset();
    verifyStreakIntegrity();
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
        playCompletionChime(pendingCompletionSound);
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
        verifyDailyReset();
        verifyStreakIntegrity();
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
        renderProfileCardData(); // Re-render card syncs task changes directly to exported file 
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

    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 420, height: 430 });

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
verifyStreakIntegrity();
