console.log("Echoloop Game Mode Loaded — Always On");

// ======================================================
// CORE CONFIG
// ======================================================
const backend = "https://echoloop-backend.onrender.com";
const apiBase = backend.replace(/\/$/, "");
const wsUrl = apiBase.replace(/^http/, "wss"); // FIXED for Render

// DOM ELEMENTS
const form = document.getElementById("echo-form");
const textEl = document.getElementById("echo-text");
const statusEl = document.getElementById("status");
const container = document.getElementById("echo-container");
const presenceEl = document.getElementById("presence");
const overlay = document.querySelector(".world-overlay");

// ======================================================
// GLOBAL GAME STATE
// ======================================================
const GameState = {
  echoes: [],
  moodCounts: { happy: 0, sad: 0, angry: 0, dreamy: 0, neutral: 0 },
  streak: [],
  activeQuests: [],
  portals: [],
  pets: [],
  constellations: [],
  storms: [],
  worldEvents: [],
  lastEventTime: 0,
  ws: null,
};

// ======================================================
// UTILITY FUNCTIONS
// ======================================================
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function now() {
  return Date.now();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ======================================================
// MOOD COLORS
// ======================================================
const moodColorMap = {
  happy: "#00ffcc",
  sad: "#4466ff",
  angry: "#ff3366",
  dreamy: "#ff99ff",
  neutral: "#8a5bff",
};

// ======================================================
// MOOD ZONES (gravity wells)
// ======================================================
const clusterCenters = {
  happy: { x: 20, y: 20 },
  sad: { x: 70, y: 70 },
  angry: { x: 70, y: 20 },
  dreamy: { x: 20, y: 70 },
  neutral: { x: 45, y: 45 },
};

// ======================================================
// ORB PLACEMENT
// ======================================================
function placeOrb(orb, mood) {
  const zone = clusterCenters[mood] || clusterCenters.neutral;
  const pullStrength = 0.6;
  const randX = Math.random() * 40 - 20;
  const randY = Math.random() * 40 - 20;
  const x = zone.x + randX * (1 - pullStrength);
  const y = zone.y + randY * (1 - pullStrength);
  orb.style.left = `${x}%`;
  orb.style.top = `${y}%`;
}

// ======================================================
// WORLD PULSE
// ======================================================
function worldPulse(color) {
  if (!overlay) return;
  overlay.style.background = `radial-gradient(circle at 20% 20%, ${color}, transparent 60%), radial-gradient(circle at 80% 80%, ${color}, transparent 60%)`;
  overlay.style.opacity = "0.5";
  setTimeout(() => {
    overlay.style.opacity = "0.25";
  }, 400);
}

// ======================================================
// BACKGROUND MOOD SHIFT
// ======================================================
function updateWorldBackground(mood) {
  const colors = {
    happy: "#00ffcc",
    sad: "#0044ff",
    angry: "#ff0044",
    dreamy: "#cc66ff",
    neutral: "#4b00ff",
  };

  const color = colors[mood] || colors.neutral;
  document.body.style.background =
    `radial-gradient(circle at top, ${color}55, #050014 70%, #000000)`;
}

// ======================================================
// ORB RENDERING PIPELINE (BASE)
// ======================================================
function createOrbElement(echo, index = 0) {
  const orb = document.createElement("div");
  orb.className = "echo-orb";

  const mood = echo.mood || "neutral";
  orb.dataset.mood = mood;

  const created = new Date(echo.createdAt);
  const timeStr = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  orb.style.color = moodColorMap[mood] || moodColorMap.neutral;

  orb.innerHTML = `
    <div>${echo.text}</div>
    <span class="echo-time">${timeStr}</span>
  `;

  placeOrb(orb, mood);
  orb.style.animationDelay = `${index * 0.05}s`;

  return orb;
}

// ======================================================
// ORB DECAY (BASE)
// ======================================================
function scheduleOrbDecay(orb) {
  setTimeout(() => {
    orb.style.transition = "opacity 30s ease, transform 30s ease";
    orb.style.opacity = "0";
    orb.style.transform += " scale(0.4)";

    // particle burst
    const particleCount = 26;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("div");
      p.className = "echo-particle";
      p.style.background = orb.style.color;

      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 40;

      p.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      p.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);

      p.style.left = orb.style.left;
      p.style.top = orb.style.top;

      container.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }

    setTimeout(() => orb.remove(), 3000);
  }, 60000);
}

// ======================================================
// BASE ADD ECHO (will be overridden by game pipeline)
// ======================================================
function addEchoToWorld(echo, index = 0) {
  const orb = createOrbElement(echo, index);
  container.appendChild(orb);
  scheduleOrbDecay(orb);
  worldPulse((moodColorMap[echo.mood] || moodColorMap.neutral) + "55");
  GameState.echoes.push({ echo, orb });
}

// ======================================================
// RENDER ALL ECHOES (INITIAL LOAD)
// ======================================================
function renderEchoes(echoes) {
  container.innerHTML = "";
  const max = 40;
  const slice = echoes.slice(-max);
  slice.forEach((echo, i) => addEchoToWorld(echo, i));
}

// ======================================================
// LOAD ECHOES FROM BACKEND
// ======================================================
async function loadEchoes() {
  try {
    const res = await fetch(`${apiBase}/echoes`);
    const data = await res.json();
    renderEchoes(data);
  } catch (err) {
    console.error("Failed to load echoes", err);
  }
}

// ======================================================
// WEBSOCKET HANDLING (BASE)
// ======================================================
function connectWS() {
  try {
    const ws = new WebSocket(wsUrl);
    GameState.ws = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "new_echo" && data.echo) {
        addEchoToWorld(data.echo);
      }

      if (data.type === "world_mood" && data.mood) {
        updateWorldBackground(data.mood);
      }

      if (data.type === "world_reset") {
        container.innerHTML = "";
      }

      if (data.type === "presence") {
        const online = Number(data.online);
        if (!isNaN(online) && presenceEl) {
          presenceEl.textContent = `${online} explorers online`;
        }
      }

      // game WS hooks could go here later if backend emits events
    };

    ws.onclose = () => {
      console.log("WebSocket closed, retrying...");
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      console.log("WebSocket error");
    };
  } catch (err) {
    console.error("WebSocket init failed", err);
  }
}

// ======================================================
// FORM SUBMISSION
// ======================================================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) return;

    statusEl.textContent = "Sending echo...";
    try {
      const res = await fetch(`${apiBase}/echoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await res.json();

      if (!res.ok) {
        statusEl.textContent = data.error || "Error sending echo.";
        return;
      }

      textEl.value = "";
      statusEl.textContent = "Echo sent.";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error sending echo.";
    }
  });
}

// ======================================================
// CHUNK 2 — GAME SYSTEMS (ALWAYS ON)
// ======================================================

// ------------------------------------------------------
// RARITY SYSTEM
// ------------------------------------------------------
const RARITIES = ["common", "golden", "shadow", "prism", "chaos"];

function rollRarity() {
  const r = Math.random();
  if (r < 0.02) return "chaos";
  if (r < 0.05) return "prism";
  if (r < 0.10) return "shadow";
  if (r < 0.18) return "golden";
  return "common";
}

function applyRarity(orb, echo) {
  const rarity = rollRarity();
  orb.dataset.rarity = rarity;

  switch (rarity) {
    case "golden":
      orb.classList.add("echo-golden");
      orb.style.filter = "drop-shadow(0 0 12px gold)";
      orb.style.animationDuration = "18s";
      break;
    case "shadow":
      orb.classList.add("echo-shadow");
      orb.style.filter = "drop-shadow(0 0 12px #000)";
      orb.style.opacity = "0.8";
      break;
    case "prism":
      orb.classList.add("echo-prism");
      orb.style.filter = "drop-shadow(0 0 14px #ffffff)";
      spawnPrismMiniEchoes(orb, echo);
      break;
    case "chaos":
      orb.classList.add("echo-chaos");
      orb.style.filter = "drop-shadow(0 0 16px #ff00ff)";
      triggerChaosBurst(orb, echo);
      break;
    default:
      break;
  }
}

function spawnPrismMiniEchoes(orb, echo) {
  const moods = ["happy", "sad", "angry", "dreamy", "neutral"];
  for (let i = 0; i < 3; i++) {
    const miniEcho = {
      ...echo,
      mood: choice(moods),
      text: echo.text + " ✶",
      createdAt: echo.createdAt,
    };
    const miniOrb = createOrbElement(miniEcho);
    miniOrb.style.transform = "scale(0.6)";
    container.appendChild(miniOrb);
    scheduleOrbDecay(miniOrb);
    GameState.echoes.push({ echo: miniEcho, orb: miniOrb });
  }
}

function triggerChaosBurst(orb, echo) {
  worldPulse((moodColorMap[echo.mood] || moodColorMap.neutral) + "aa");
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("div");
    p.className = "echo-particle chaos";
    p.style.background = moodColorMap[echo.mood] || moodColorMap.neutral;
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 60;
    p.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    p.style.left = orb.style.left;
    p.style.top = orb.style.top;
    container.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
}

// ------------------------------------------------------
// PET SYSTEM
// ------------------------------------------------------
let mouseX = 50;
let mouseY = 50;

document.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * 100;
  mouseY = ((e.clientY - rect.top) / rect.height) * 100;
});

function maybeMakePet(orb) {
  if (Math.random() < 0.08) {
    orb.classList.add("echo-pet");
    GameState.pets.push(orb);
  }
}

function updatePets() {
  GameState.pets.forEach((orb) => {
    const cx = parseFloat(orb.style.left);
    const cy = parseFloat(orb.style.top);
    const nx = cx + (mouseX - cx) * 0.05;
    const ny = cy + (mouseY - cy) * 0.05;
    orb.style.left = `${nx}%`;
    orb.style.top = `${ny}%`;
  });
}
setInterval(updatePets, 60);

// ------------------------------------------------------
// STREAK COMBO SYSTEM
// ------------------------------------------------------
function registerEchoSent() {
  const t = now();
  GameState.streak.push(t);
  GameState.streak = GameState.streak.filter((ts) => t - ts < 10000);

  const count = GameState.streak.length;
  if (count >= 8) triggerStreakEvent(3);
  else if (count >= 5) triggerStreakEvent(2);
  else if (count >= 3) triggerStreakEvent(1);
}

function triggerStreakEvent(level) {
  const color = ["#ffffff", "#ffcc00", "#ff00ff"][level - 1];
  const comet = document.createElement("div");
  comet.className = "echo-comet";
  comet.style.background = color;
  container.appendChild(comet);
  setTimeout(() => comet.remove(), 1200);
  worldPulse(color + "aa");
}

// hook streak into form submit
if (form) {
  form.addEventListener("submit", () => {
    registerEchoSent();
  });
}

// ------------------------------------------------------
// QUEST SYSTEM (LOCAL)
// ------------------------------------------------------
const QUEST_MOODS = ["happy", "sad", "angry", "dreamy", "neutral"];
let activeQuest = null;

function startRandomQuest() {
  const mood = choice(QUEST_MOODS);
  const target = Math.floor(rand(3, 7));
  activeQuest = { mood, target, progress: 0 };
  showQuestBanner(activeQuest);
}

function showQuestBanner(quest) {
  let banner = document.getElementById("quest-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "quest-banner";
    banner.className = "quest-banner";
    document.body.appendChild(banner);
  }
  banner.textContent = `Quest: Send ${quest.target} ${quest.mood} echoes (${quest.progress}/${quest.target})`;
}

function updateQuestProgress(echo) {
  if (!activeQuest) return;
  if (echo.mood === activeQuest.mood) {
    activeQuest.progress++;
    showQuestBanner(activeQuest);
    if (activeQuest.progress >= activeQuest.target) {
      completeQuest(activeQuest);
      activeQuest = null;
      setTimeout(startRandomQuest, 8000);
    }
  }
}

function completeQuest(quest) {
  triggerQuestFireworks(quest.mood);
}

function triggerQuestFireworks(mood) {
  const color = moodColorMap[mood] || moodColorMap.neutral;
  for (let i = 0; i < 30; i++) {
    const fw = document.createElement("div");
    fw.className = "echo-firework";
    fw.style.background = color;
    fw.style.left = `${rand(10, 90)}%`;
    fw.style.top = `${rand(10, 90)}%`;
    container.appendChild(fw);
    setTimeout(() => fw.remove(), 1200);
  }
  worldPulse(color + "aa");
}

setTimeout(startRandomQuest, 5000);

// ------------------------------------------------------
// MOOD DOMINANCE SYSTEM
// ------------------------------------------------------
function registerMood(echo) {
  const mood = echo.mood || "neutral";
  GameState.moodCounts[mood] = (GameState.moodCounts[mood] || 0) + 1;
}

function getDominantMood() {
  let bestMood = "neutral";
  let bestCount = 0;
  for (const mood in GameState.moodCounts) {
    if (GameState.moodCounts[mood] > bestCount) {
      bestCount = GameState.moodCounts[mood];
      bestMood = mood;
    }
  }
  return bestMood;
}

function applyMoodDominanceEffects() {
  const mood = getDominantMood();
  triggerStorm(mood);
}
setInterval(applyMoodDominanceEffects, 15000);

// ------------------------------------------------------
// PORTAL SYSTEM
// ------------------------------------------------------
function spawnPortal() {
  const portal = document.createElement("div");
  portal.className = "echo-portal";
  portal.style.left = `${rand(15, 85)}%`;
  portal.style.top = `${rand(15, 85)}%`;
  container.appendChild(portal);
  GameState.portals.push(portal);
  setTimeout(() => {
    portal.remove();
    GameState.portals = GameState.portals.filter((p) => p !== portal);
  }, 10000);
}

function applyPortalToOrb(orb) {
  if (GameState.portals.length === 0) return;
  if (Math.random() < 0.2) {
    const portal = choice(GameState.portals);
    orb.style.left = portal.style.left;
    orb.style.top = portal.style.top;
    if (Math.random() < 0.3) {
      const clone = orb.cloneNode(true);
      container.appendChild(clone);
      scheduleOrbDecay(clone);
      GameState.echoes.push({
        echo: { text: "portal echo", mood: orb.dataset.mood, createdAt: new Date() },
        orb: clone
      });
    }
  }
}

setInterval(spawnPortal, 20000);

// ------------------------------------------------------
// CONSTELLATION SYSTEM
// ------------------------------------------------------
function updateConstellations() {
  GameState.constellations.forEach((line) => line.remove());
  GameState.constellations = [];

  const orbs = GameState.echoes.map((e) => e.orb);
  for (let i = 0; i < orbs.length; i++) {
    for (let j = i + 1; j < orbs.length; j++) {
      const a = orbs[i];
      const b = orbs[j];
      const ax = parseFloat(a.style.left);
      const ay = parseFloat(a.style.top);
      const bx = parseFloat(b.style.left);
      const by = parseFloat(b.style.top);
      const dx = ax - bx;
      const dy = ay - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        const line = document.createElement("div");
        line.className = "echo-constellation";
        line.style.setProperty("--x1", `${ax}%`);
        line.style.setProperty("--y1", `${ay}%`);
        line.style.setProperty("--x2", `${bx}%`);
        line.style.setProperty("--y2", `${by}%`);
        container.appendChild(line);
        GameState.constellations.push(line);
      }
    }
  }
}
setInterval(updateConstellations, 3000);

// ------------------------------------------------------
// STORM SYSTEM
// ------------------------------------------------------
function triggerStorm(mood) {
  const cls = `storm-${mood}`;
  document.body.classList.add(cls);
  setTimeout(() => {
    document.body.classList.remove(cls);
  }, 3000);
}

// ------------------------------------------------------
// EVOLUTION SYSTEM
// ------------------------------------------------------
function evolveOrb(orb) {
  const mood = orb.dataset.mood || "neutral";
  switch (mood) {
    case "happy":
      orb.classList.add("echo-evolve-happy");
      break;
    case "sad":
      orb.classList.add("echo-evolve-sad");
      break;
    case "angry":
      orb.classList.add("echo-evolve-angry");
      break;
    case "dreamy":
      orb.classList.add("echo-evolve-dreamy");
      break;
    case "neutral":
      orb.classList.add("echo-evolve-neutral");
      break;
  }
}

function scheduleEvolution(orb) {
  setTimeout(() => evolveOrb(orb), rand(8000, 20000));
}

// ------------------------------------------------------
// TRAIL SYSTEM
// ------------------------------------------------------
function addTrail(orb) {
  const trail = document.createElement("div");
  trail.className = "echo-trail";
  trail.style.left = orb.style.left;
  trail.style.top = orb.style.top;
  trail.style.borderColor = orb.style.color;
  container.appendChild(trail);
  setTimeout(() => trail.remove(), 2000);
}

function updateTrails() {
  GameState.echoes.forEach(({ orb }) => {
    if (Math.random() < 0.15) addTrail(orb);
  });
}
setInterval(updateTrails, 700);

// ------------------------------------------------------
// COLLISION SYSTEM
// ------------------------------------------------------
function checkCollisions() {
  const entries = GameState.echoes;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].orb;
      const b = entries[j].orb;
      const ax = parseFloat(a.style.left);
      const ay = parseFloat(a.style.top);
      const bx = parseFloat(b.style.left);
      const by = parseFloat(b.style.top);
      const dx = ax - bx;
      const dy = ay - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) {
        handleCollision(a, b);
      }
    }
  }
}

function handleCollision(a, b) {
  if (!a.isConnected || !b.isConnected) return;
  const mode = choice(["bounce", "merge", "explode"]);
  switch (mode) {
    case "bounce":
      a.style.transform += " translate(10px, -10px)";
      b.style.transform += " translate(-10px, 10px)";
      break;
    case "merge":
      const merged = a.cloneNode(true);
      merged.style.transform = "scale(1.3)";
      container.appendChild(merged);
      scheduleOrbDecay(merged);
      a.remove();
      b.remove();
      break;
    case "explode":
      triggerChaosBurst(a, {
        mood: a.dataset.mood || "neutral",
        text: "collision",
        createdAt: new Date()
      });
      a.remove();
      b.remove();
      break;
  }
}
setInterval(checkCollisions, 800);

// ------------------------------------------------------
// WORLD EVENTS SYSTEM
// ------------------------------------------------------
function triggerWorldEvent() {
  const events = ["meteor", "portal_surge", "constellation_bloom", "mood_inversion", "echo_migration"];
  const ev = choice(events);
  switch (ev) {
    case "meteor":
      meteorShower();
      break;
    case "portal_surge":
      for (let i = 0; i < 3; i++) spawnPortal();
      break;
    case "constellation_bloom":
      updateConstellations();
      break;
    case "mood_inversion":
      invertMoods();
      break;
    case "echo_migration":
      migrateEchoes();
      break;
  }
}

function meteorShower() {
  for (let i = 0; i < 20; i++) {
    const m = document.createElement("div");
    m.className = "echo-meteor";
    m.style.left = `${rand(0, 100)}%`;
    m.style.top = `${rand(-10, 10)}%`;
    container.appendChild(m);
    setTimeout(() => m.remove(), 1500);
  }
}

function invertMoods() {
  GameState.echoes.forEach(({ echo, orb }) => {
    const moods = ["happy", "sad", "angry", "dreamy", "neutral"];
    const newMood = choice(moods.filter((m) => m !== (echo.mood || "neutral")));
    echo.mood = newMood;
    orb.dataset.mood = newMood;
    orb.style.color = moodColorMap[newMood] || moodColorMap.neutral;
  });
}

function migrateEchoes() {
  GameState.echoes.forEach(({ orb }) => {
    orb.style.left = `${rand(10, 90)}%`;
    orb.style.top = `${rand(10, 90)}%`;
  });
}

setInterval(() => triggerWorldEvent(), rand(120000, 180000));

// ------------------------------------------------------
// OVERRIDE ADD ECHO PIPELINE TO INCLUDE GAME SYSTEMS
// ------------------------------------------------------
function addEchoToWorld(echo, index = 0) {
  const orb = createOrbElement(echo, index);

  applyRarity(orb, echo);
  maybeMakePet(orb);
  scheduleEvolution(orb);
  applyPortalToOrb(orb);
  registerMood(echo);

  container.appendChild(orb);
  scheduleOrbDecay(orb);

  worldPulse((moodColorMap[echo.mood] || moodColorMap.neutral) + "55");

  GameState.echoes.push({ echo, orb });

  updateQuestProgress(echo);
}

// ======================================================
// INITIALIZATION
// ======================================================
(async function init() {
  await loadEchoes();
  connectWS();
  console.log("Echoloop Game Engine Ready — Always On Mode.");
})();
