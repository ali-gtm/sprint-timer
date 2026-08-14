(function () {
  "use strict";

  var STORAGE_KEY = "sprint-timer-data";
  var RING_CIRCUMFERENCE = 628.3;

  var state = loadState();

  var timer = {
    mode: "focus", // "focus" | "break" | "longBreak"
    sessionIndex: 1, // 1-based count of focus sessions completed in the current cycle
    running: false,
    endTime: null, // absolute ms timestamp when the current phase should end, while running
    remainingMs: focusDurationMs(),
    intervalId: null
  };

  var els = {
    statsBtn: document.getElementById("statsBtn"),
    timerView: document.getElementById("timerView"),
    statsView: document.getElementById("statsView"),

    subjectInput: document.getElementById("subjectInput"),
    notifStatus: document.getElementById("notifStatus"),
    subjectSuggestions: document.getElementById("subjectSuggestions"),

    timerStage: document.getElementById("timerStage"),
    timerRingProgress: document.getElementById("timerRingProgress"),
    timerModeLabel: document.getElementById("timerModeLabel"),
    timerTimeLabel: document.getElementById("timerTimeLabel"),
    timerSessionLabel: document.getElementById("timerSessionLabel"),

    resetBtn: document.getElementById("resetBtn"),
    startPauseBtn: document.getElementById("startPauseBtn"),
    skipBtn: document.getElementById("skipBtn"),

    presetClassicBtn: document.getElementById("presetClassicBtn"),
    presetDeepBtn: document.getElementById("presetDeepBtn"),
    presetCustomBtn: document.getElementById("presetCustomBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    focusMinutesInput: document.getElementById("focusMinutesInput"),
    breakMinutesInput: document.getElementById("breakMinutesInput"),
    sessionsUntilLongBreakInput: document.getElementById("sessionsUntilLongBreakInput"),
    longBreakMinutesInput: document.getElementById("longBreakMinutesInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),

    taskCount: document.getElementById("taskCount"),
    newTaskText: document.getElementById("newTaskText"),
    addTaskBtn: document.getElementById("addTaskBtn"),
    emptyTasks: document.getElementById("emptyTasks"),
    taskList: document.getElementById("taskList"),

    backFromStatsBtn: document.getElementById("backFromStatsBtn"),
    statsSummaryGrid: document.getElementById("statsSummaryGrid"),
    weekChart: document.getElementById("weekChart"),
    subjectStats: document.getElementById("subjectStats"),
    emptySubjectStats: document.getElementById("emptySubjectStats"),

    installToast: document.getElementById("installToast"),
    installBtn: document.getElementById("installBtn"),
    dismissInstallBtn: document.getElementById("dismissInstallBtn")
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      parsed.settings = Object.assign(defaultState().settings, parsed.settings || {});
      parsed.tasks = parsed.tasks || [];
      parsed.sessions = parsed.sessions || [];
      parsed.nextTaskId = parsed.nextTaskId || 1;
      parsed.nextSessionId = parsed.nextSessionId || 1;
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      settings: { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsUntilLongBreak: 4 },
      tasks: [],
      sessions: [],
      nextTaskId: 1,
      nextSessionId: 1
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error("Could not save data", e);
      return false;
    }
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function focusDurationMs() { return (state ? state.settings.focusMinutes : 25) * 60 * 1000; }
  function breakDurationMs() { return state.settings.breakMinutes * 60 * 1000; }
  function longBreakDurationMs() { return state.settings.longBreakMinutes * 60 * 1000; }

  function durationForMode(mode) {
    if (mode === "focus") return focusDurationMs();
    if (mode === "longBreak") return longBreakDurationMs();
    return breakDurationMs();
  }

  /* ---------- timer engine ---------- */

  function applyModeColors() {
    var isFocus = timer.mode === "focus";
    var root = document.documentElement.style;
    root.setProperty("--mode-color", isFocus ? "#0f9488" : "#d9820a");
    root.setProperty("--mode-color-dark", isFocus ? "#0a5f57" : "#b56906");
    root.setProperty("--mode-tint", isFocus ? "#ecfdf7" : "#fff8ec");
  }

  function modeLabel() {
    if (timer.mode === "focus") return "Focus";
    if (timer.mode === "longBreak") return "Long break";
    return "Break";
  }

  function renderTimerFace() {
    var totalMs = durationForMode(timer.mode);
    var remaining = timer.running ? Math.max(0, timer.endTime - Date.now()) : timer.remainingMs;
    var totalSeconds = Math.ceil(remaining / 1000);
    var mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    var ss = String(totalSeconds % 60).padStart(2, "0");

    els.timerTimeLabel.textContent = mm + ":" + ss;
    els.timerModeLabel.textContent = modeLabel();
    els.timerSessionLabel.textContent = timer.mode === "focus"
      ? "Session " + timer.sessionIndex + " of " + state.settings.sessionsUntilLongBreak
      : "Next up: Focus";

    var fraction = totalMs > 0 ? remaining / totalMs : 0;
    els.timerRingProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);

    document.title = timer.running ? (mm + ":" + ss + " · " + modeLabel() + " — Sprint") : "Sprint — Focus Timer";
    return remaining;
  }

  function tick() {
    var remaining = renderTimerFace();
    if (remaining <= 0) completePhase();
  }

  function startInterval() {
    stopInterval();
    timer.intervalId = setInterval(tick, 250);
  }

  function stopInterval() {
    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
  }

  function startTimer() {
    ensureNotificationPermission();
    timer.running = true;
    timer.endTime = Date.now() + timer.remainingMs;
    els.timerStage.classList.add("running");
    els.startPauseBtn.textContent = timer.mode === "focus" ? "Pause" : "Pause break";
    startInterval();
    renderTimerFace();
  }

  function pauseTimer() {
    timer.remainingMs = Math.max(0, timer.endTime - Date.now());
    timer.running = false;
    els.timerStage.classList.remove("running");
    els.startPauseBtn.textContent = timer.mode === "focus" ? "Resume focusing" : "Resume break";
    stopInterval();
    renderTimerFace();
  }

  function resetTimer() {
    timer.running = false;
    timer.remainingMs = durationForMode(timer.mode);
    els.timerStage.classList.remove("running");
    els.startPauseBtn.textContent = timer.mode === "focus" ? "Start focusing" : "Start break";
    stopInterval();
    renderTimerFace();
  }

  function completePhase() {
    stopInterval();
    timer.running = false;
    els.timerStage.classList.remove("running");

    if (timer.mode === "focus") {
      logCompletedSession();
      var isLongBreak = timer.sessionIndex % state.settings.sessionsUntilLongBreak === 0;
      timer.mode = isLongBreak ? "longBreak" : "break";
    } else {
      if (timer.mode === "longBreak") timer.sessionIndex = 1; else timer.sessionIndex += 1;
      timer.mode = "focus";
    }

    timer.remainingMs = durationForMode(timer.mode);
    applyModeColors();
    notifyPhaseChange();
    renderSubjectSuggestions();
    startTimer();
  }

  function skipPhase() {
    stopInterval();
    timer.running = false;
    els.timerStage.classList.remove("running");

    if (timer.mode === "focus") {
      var isLongBreak = timer.sessionIndex % state.settings.sessionsUntilLongBreak === 0;
      timer.mode = isLongBreak ? "longBreak" : "break";
    } else {
      if (timer.mode === "longBreak") timer.sessionIndex = 1; else timer.sessionIndex += 1;
      timer.mode = "focus";
    }

    timer.remainingMs = durationForMode(timer.mode);
    applyModeColors();
    els.startPauseBtn.textContent = timer.mode === "focus" ? "Start focusing" : "Start break";
    renderTimerFace();
  }

  function logCompletedSession() {
    var subject = els.subjectInput.value.trim() || "Untitled";
    state.sessions.push({
      id: state.nextSessionId++,
      subject: subject,
      minutes: state.settings.focusMinutes,
      date: todayISO()
    });
    saveState();
  }

  /* ---------- notifications ---------- */

  var notificationPermissionRequested = false;

  function renderNotifStatus() {
    if (!("Notification" in window)) {
      els.notifStatus.classList.add("hidden");
      return;
    }
    var permission = Notification.permission;
    if (permission === "denied") {
      els.notifStatus.textContent = "🔕 Notifications are blocked for this app — enable them in your phone/browser settings to get alerts when a session ends.";
      els.notifStatus.className = "notif-status blocked";
    } else if (permission === "granted") {
      els.notifStatus.textContent = "🔔 Notifications are on";
      els.notifStatus.className = "notif-status ok";
    } else {
      els.notifStatus.classList.add("hidden");
      return;
    }
    els.notifStatus.classList.remove("hidden");
  }

  function ensureNotificationPermission() {
    if (notificationPermissionRequested) return;
    notificationPermissionRequested = true;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(renderNotifStatus);
    }
  }

  function notifyPhaseChange() {
    var title = timer.mode === "focus" ? "Time to focus" : "Take a break";
    var body = timer.mode === "focus"
      ? "Break's over — back to " + (els.subjectInput.value.trim() || "it") + "."
      : (timer.mode === "longBreak" ? "Nice streak — take a longer breather." : "Nice work — short break time.");

    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body: body, icon: "icons/icon-192.png" }); } catch (e) { console.error("Notification failed", e); }
    }
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    playBeep();
  }

  function playBeep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = timer.mode === "focus" ? 660 : 520;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
      osc.onended = function () { ctx.close(); };
    } catch (e) { /* ignore */ }
  }

  /* ---------- subject suggestions ---------- */

  function renderSubjectSuggestions() {
    var names = {};
    state.sessions.forEach(function (s) { names[s.subject] = true; });
    state.tasks.forEach(function (t) { if (t.subject) names[t.subject] = true; });
    els.subjectSuggestions.innerHTML = Object.keys(names).map(function (n) {
      return "<option value=\"" + escapeHtml(n) + "\"></option>";
    }).join("");
  }

  /* ---------- tasks ---------- */

  function renderTasks() {
    els.taskList.innerHTML = "";
    var doneCount = state.tasks.filter(function (t) { return t.done; }).length;
    els.taskCount.textContent = state.tasks.length ? (doneCount + " / " + state.tasks.length + " done") : "";
    els.emptyTasks.classList.toggle("hidden", state.tasks.length > 0);

    state.tasks.forEach(function (task, index) {
      var li = document.createElement("li");
      li.className = "task-row" + (task.done ? " done" : "");
      li.style.animationDelay = Math.min(index * 0.04, 0.3) + "s";

      var checkbox = document.createElement("button");
      checkbox.className = "task-checkbox" + (task.done ? " checked" : "");
      checkbox.setAttribute("aria-label", task.done ? "Mark as not done" : "Mark as done");
      checkbox.textContent = task.done ? "✓" : "";
      checkbox.addEventListener("click", function () {
        task.done = !task.done;
        saveState();
        renderTasks();
      });
      li.appendChild(checkbox);

      var text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      text.dir = "auto";
      li.appendChild(text);

      if (task.subject) {
        var tag = document.createElement("span");
        tag.className = "task-subject-tag";
        tag.textContent = task.subject;
        li.appendChild(tag);
      }

      var del = document.createElement("button");
      del.className = "task-delete";
      del.setAttribute("aria-label", "Delete task");
      del.textContent = "×";
      del.addEventListener("click", function () {
        state.tasks = state.tasks.filter(function (t) { return t.id !== task.id; });
        saveState();
        renderTasks();
      });
      li.appendChild(del);

      els.taskList.appendChild(li);
    });
  }

  /* ---------- stats ---------- */

  function minutesOnDate(dateIso) {
    return state.sessions.filter(function (s) { return s.date === dateIso; })
      .reduce(function (sum, s) { return sum + s.minutes; }, 0);
  }

  function computeStreak() {
    var streak = 0;
    var cursor = new Date();
    while (true) {
      var m = String(cursor.getMonth() + 1).padStart(2, "0");
      var d = String(cursor.getDate()).padStart(2, "0");
      var iso = cursor.getFullYear() + "-" + m + "-" + d;
      var minutes = minutesOnDate(iso);
      if (minutes > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        if (iso === todayISO()) { cursor.setDate(cursor.getDate() - 1); continue; }
        break;
      }
    }
    return streak;
  }

  function renderStats() {
    var today = todayISO();
    var todayMinutes = minutesOnDate(today);

    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var iso = d.getFullYear() + "-" + m + "-" + day;
      last7.push({ iso: iso, label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), minutes: minutesOnDate(iso), isToday: iso === today });
    }
    var weekTotal = last7.reduce(function (sum, d) { return sum + d.minutes; }, 0);
    var streak = computeStreak();

    var tiles = [
      { value: todayMinutes, label: "Minutes today", icon: "⏱️", accent: "linear-gradient(90deg, #0f9488, #2dd4bf)" },
      { value: weekTotal, label: "Minutes this week", icon: "📅", accent: "linear-gradient(90deg, #d9820a, #f6ac2e)" },
      { value: streak, label: streak === 1 ? "Day streak" : "Day streak", icon: "🔥", accent: "linear-gradient(90deg, #d0463a, #f6ac2e)" },
      { value: state.tasks.filter(function (t) { return t.done; }).length, label: "Tasks done", icon: "✅", accent: "linear-gradient(90deg, #0f9488, #d9820a)" }
    ];

    els.statsSummaryGrid.innerHTML = "";
    tiles.forEach(function (t, index) {
      var tile = document.createElement("div");
      tile.className = "stat-tile";
      tile.style.setProperty("--stat-accent", t.accent);
      tile.style.animationDelay = (index * 0.06) + "s";
      tile.innerHTML = "<span class=\"stat-tile-icon\">" + t.icon + "</span><div class=\"stat-value\">" + t.value + "</div><div class=\"stat-label\">" + t.label + "</div>";
      els.statsSummaryGrid.appendChild(tile);
    });

    var maxDay = Math.max(1, Math.max.apply(null, last7.map(function (d) { return d.minutes; })));
    els.weekChart.innerHTML = "";
    last7.forEach(function (d) {
      var wrap = document.createElement("div");
      wrap.className = "week-chart-bar-wrap" + (d.isToday ? " today" : "");
      var bar = document.createElement("div");
      bar.className = "week-chart-bar";
      bar.style.height = Math.max(3, Math.round((d.minutes / maxDay) * 100)) + "%";
      bar.title = d.minutes + " min";
      var label = document.createElement("span");
      label.className = "week-chart-label";
      label.textContent = d.label;
      wrap.appendChild(bar);
      wrap.appendChild(label);
      els.weekChart.appendChild(wrap);
    });

    var bySubject = {};
    state.sessions.forEach(function (s) {
      bySubject[s.subject] = (bySubject[s.subject] || 0) + s.minutes;
    });
    var subjectEntries = Object.keys(bySubject).map(function (name) { return { name: name, minutes: bySubject[name] }; })
      .sort(function (a, b) { return b.minutes - a.minutes; });

    els.emptySubjectStats.classList.toggle("hidden", subjectEntries.length > 0);
    els.subjectStats.innerHTML = "";
    var maxSubject = subjectEntries.length ? subjectEntries[0].minutes : 1;
    subjectEntries.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "subject-stat-row";
      row.innerHTML =
        "<div class=\"subject-stat-top\"><span>" + escapeHtml(entry.name) + "</span><span class=\"subject-stat-minutes\">" + entry.minutes + " min</span></div>" +
        "<div class=\"subject-stat-bar-track\"><div class=\"subject-stat-bar-fill\" style=\"width:" + Math.round((entry.minutes / maxSubject) * 100) + "%\"></div></div>";
      els.subjectStats.appendChild(row);
    });
  }

  /* ---------- events ---------- */

  els.startPauseBtn.addEventListener("click", function () {
    if (timer.running) pauseTimer(); else startTimer();
  });

  els.resetBtn.addEventListener("click", resetTimer);
  els.skipBtn.addEventListener("click", skipPhase);

  var PRESETS = {
    classic: { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsUntilLongBreak: 4 },
    deep: { focusMinutes: 50, breakMinutes: 10, longBreakMinutes: 20, sessionsUntilLongBreak: 3 }
  };

  function setActivePreset(name) {
    els.presetClassicBtn.classList.toggle("active", name === "classic");
    els.presetDeepBtn.classList.toggle("active", name === "deep");
    els.presetCustomBtn.classList.toggle("active", name === "custom");
  }

  function applyPreset(name) {
    setActivePreset(name);

    if (name === "custom") {
      els.settingsPanel.classList.remove("hidden");
      return;
    }

    els.settingsPanel.classList.add("hidden");
    state.settings = Object.assign({}, PRESETS[name]);
    saveState();
    els.focusMinutesInput.value = state.settings.focusMinutes;
    els.breakMinutesInput.value = state.settings.breakMinutes;
    els.longBreakMinutesInput.value = state.settings.longBreakMinutes;
    els.sessionsUntilLongBreakInput.value = state.settings.sessionsUntilLongBreak;

    if (!timer.running) {
      timer.remainingMs = durationForMode(timer.mode);
      renderTimerFace();
    }
  }

  els.presetClassicBtn.addEventListener("click", function () { applyPreset("classic"); });
  els.presetDeepBtn.addEventListener("click", function () { applyPreset("deep"); });
  els.presetCustomBtn.addEventListener("click", function () { applyPreset("custom"); });

  els.saveSettingsBtn.addEventListener("click", function () {
    var focusMinutes = Math.max(1, Number(els.focusMinutesInput.value) || 25);
    var breakMinutes = Math.max(1, Number(els.breakMinutesInput.value) || 5);
    var longBreakMinutes = Math.max(1, Number(els.longBreakMinutesInput.value) || 15);
    var sessionsUntilLongBreak = Math.max(2, Number(els.sessionsUntilLongBreakInput.value) || 4);

    state.settings = {
      focusMinutes: focusMinutes,
      breakMinutes: breakMinutes,
      longBreakMinutes: longBreakMinutes,
      sessionsUntilLongBreak: sessionsUntilLongBreak
    };
    saveState();

    if (!timer.running) {
      timer.remainingMs = durationForMode(timer.mode);
      renderTimerFace();
    }
    els.settingsPanel.classList.add("hidden");
  });

  els.addTaskBtn.addEventListener("click", function () {
    var text = els.newTaskText.value.trim();
    if (!text) return;
    state.tasks.push({
      id: state.nextTaskId++,
      text: text,
      done: false,
      subject: els.subjectInput.value.trim(),
      createdAt: Date.now()
    });
    els.newTaskText.value = "";
    saveState();
    renderTasks();
    renderSubjectSuggestions();
  });

  els.newTaskText.addEventListener("keydown", function (e) {
    if (e.key === "Enter") els.addTaskBtn.click();
  });

  els.statsBtn.addEventListener("click", function () {
    renderStats();
    els.timerView.classList.add("hidden");
    els.statsView.classList.remove("hidden");
  });

  els.backFromStatsBtn.addEventListener("click", function () {
    els.statsView.classList.add("hidden");
    els.timerView.classList.remove("hidden");
  });

  /* ---------- PWA install prompt ---------- */

  var deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!localStorage.getItem("sprint-install-dismissed")) {
      els.installToast.classList.remove("hidden");
    }
  });

  els.installBtn.addEventListener("click", function () {
    els.installToast.classList.add("hidden");
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt = null;
    }
  });

  els.dismissInstallBtn.addEventListener("click", function () {
    els.installToast.classList.add("hidden");
    localStorage.setItem("sprint-install-dismissed", "1");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function (err) {
        console.error("Service worker registration failed", err);
      });
    });
  }

  /* ---------- init ---------- */

  els.focusMinutesInput.value = state.settings.focusMinutes;
  els.breakMinutesInput.value = state.settings.breakMinutes;
  els.longBreakMinutesInput.value = state.settings.longBreakMinutes;
  els.sessionsUntilLongBreakInput.value = state.settings.sessionsUntilLongBreak;

  var matchedPreset = Object.keys(PRESETS).find(function (name) {
    var p = PRESETS[name];
    return p.focusMinutes === state.settings.focusMinutes &&
      p.breakMinutes === state.settings.breakMinutes &&
      p.longBreakMinutes === state.settings.longBreakMinutes &&
      p.sessionsUntilLongBreak === state.settings.sessionsUntilLongBreak;
  });
  setActivePreset(matchedPreset || "custom");

  applyModeColors();
  timer.remainingMs = durationForMode(timer.mode);
  els.startPauseBtn.textContent = "Start focusing";
  renderTimerFace();
  renderTasks();
  renderSubjectSuggestions();
  renderNotifStatus();
})();
