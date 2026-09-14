console.log("Echoloop frontend loaded");

// backend base URL
const backend = "https://echoloop-backend.onrender.com";
const apiBase = backend.replace(/\/$/, "");
const wsUrl = apiBase.replace(/^http/, "ws");

const form = document.getElementById("echo-form");
const textEl = document.getElementById("echo-text");
const statusEl = document.getElementById("status");
const container = document.getElementById("echo-container");
const presenceEl = document.getElementById("presence");
const overlay = document.querySelector(".world-overlay");

// --------------------------------------------------
// CLEAR ECHOES (ADMIN NUKE)
// --------------------------------------------------
async function clearEchoes() {
  try {
    const res = await fetch(`${apiBase}/admin/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": "changeme"
      }
    });

    const data = await res.json();
    console.log("Echoes cleared:", data);

    // Clear the world visually
    container.innerHTML = "";
  } catch (err) {
    console.error("Failed to clear echoes:", err);
  }
}

// Keyboard shortcut: SHIFT + DELETE
document.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "Delete") {
    clearEchoes();
  }
});

// mood zones / gravity wells
const clusterCenters = {
  happy: { x: 20, y: 20 },
  sad: { x: 70, y: 70 },
  angry: { x: 70, y: 20 },
  dreamy: { x: 20, y: 70 },
  neutral: { x: 45, y: 45 }
};

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

function worldPulse(color) {
  if (!overlay) return;
  overlay.style.background = `radial-gradient(circle at 20% 20%, ${color}, transparent 60%), radial-gradient(circle at 80% 80%, ${color}, transparent 60%)`;
  overlay.style.opacity = "0.5";
  setTimeout(() => {
    overlay.style.opacity = "0.18";
  }, 400);
}

function addEchoToWorld(echo, index = 0) {
  const orb = document.createElement("div");
  orb.className = "echo-orb";
  const mood = echo.mood || "neutral";
  orb.dataset.mood = mood;

  const created = new Date(echo.createdAt);
  const timeStr = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const moodColorMap = {
    happy: "#00ffcc",
    sad: "#4466ff",
    angry: "#ff3366",
    dreamy: "#ff99ff",
    neutral: "#8a5bff"
  };

  orb.style.color = moodColorMap[mood] || moodColorMap.neutral;

  orb.innerHTML = `
    <div>${echo.text}</div>
    <span class="echo-time">${timeStr}</span>
  `;

  placeOrb(orb, mood);
  orb.style.animationDelay = `${index * 0.05}s`;

  container.appendChild(orb);

  // echo decay
  setTimeout(() => {
    orb.style.transition = "opacity 30s ease, transform 30s ease";
    orb.style.opacity = "0";
    orb.style.transform += " scale(0.4)";
    setTimeout(() => orb.remove(), 3000);
  }, 60000);
setTimeout(() => {
  const particleCount = 26;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement("div");
    p.className = "echo-particle";
    p.style.background = orb.style.color;

    // random burst direction
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;

    p.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);

    p.style.left = orb.style.left;
    p.style.top = orb.style.top;

    container.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }

  orb.remove();
}, 60000);

  // world pulse
  worldPulse(moodColorMap[mood] + "55");
}

function renderEchoes(echoes) {
  container.innerHTML = "";
  const max = 40;
  const slice = echoes.slice(-max);
  slice.forEach((echo, i) => addEchoToWorld(echo, i));
}

async function loadEchoes() {
  try {
    const res = await fetch(`${apiBase}/echoes`);
    const data = await res.json();
    renderEchoes(data);
  } catch (err) {
    console.error("Failed to load echoes", err);
  }
}

function updateWorldBackground(mood) {
  const colors = {
    happy: "#00ffcc",
    sad: "#0044ff",
    angry: "#ff0044",
    dreamy: "#cc66ff",
    neutral: "#4b00ff"
  };

  const color = colors[mood] || colors.neutral;
  document.body.style.background =
    `radial-gradient(circle at top, ${color}, #050014 60%, #000000)`;
}

// websocket
let ws;
function connectWS() {
  try {
    ws = new WebSocket(wsUrl);

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

      if (data.type === "presence" && typeof data.online === "number") {
        if (presenceEl) {
          presenceEl.textContent = `${data.online} explorers online`;
        }
      }

      if (data.type === "mood_storm" && data.mood) {
        document.body.classList.add(`storm-${data.mood}`);
        setTimeout(() => {
          document.body.classList.remove(`storm-${data.mood}`);
        }, 3000);
      }
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

// initial load + realtime
loadEchoes();
connectWS();

// ======================================================
// WORD REACTION ENGINE — ADD-ON MODULE
// ======================================================

// ----------------------------------------------
// 1. WORD MEMORY
// ----------------------------------------------
const WordMemory = [];

function storeWords(text) {
  text.split(" ").forEach(w => {
    const word = w.toLowerCase().trim();
    if (word.length > 0) WordMemory.push(word);
  });
}

// ----------------------------------------------
// 2. MOOD DETECTION FROM TEXT
// ----------------------------------------------
const moodWords = {
  happy: ["yay", "good", "love", "nice", "fun", "great", "win"],
  sad: ["sad", "down", "hurt", "cry", "lost"],
  angry: ["mad", "angry", "hate", "wtf", "rage"],
  dreamy: ["dream", "float", "soft", "magic", "vibe"]
};

function detectMoodFromText(text) {
  const lower = text.toLowerCase();
  for (const mood in moodWords) {
    if (moodWords[mood].some(w => lower.includes(w))) {
      return mood;
    }
  }
  return null;
}

// ----------------------------------------------
// 3. WORD-TRIGGERED WORLD EVENTS
// ----------------------------------------------
function spawnSparkles() {
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 100}%`;
    container.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }
}

function spawnPortal() {
  const p = document.createElement("div");
  p.className = "word-portal";
  p.style.left = `${Math.random() * 80 + 10}%`;
  p.style.top = `${Math.random() * 80 + 10}%`;
  container.appendChild(p);
  setTimeout(() => p.remove(), 3000);
}

function triggerStormEffect() {
  document.body.classList.add("storm-word");
  setTimeout(() => document.body.classList.remove("storm-word"), 2000);
}

const wordTriggers = {
  "boom": () => triggerStormEffect(),
  "sparkle": () => spawnSparkles(),
  "portal": () => spawnPortal(),
  "storm": () => triggerStormEffect(),
};

// ----------------------------------------------
// 4. WORD-BASED PARTICLE COLORS
// ----------------------------------------------
function getParticleColor(text) {
  const t = text.toLowerCase();
  if (t.includes("fire")) return "#ff3300";
  if (t.includes("ice")) return "#00ccff";
  if (t.includes("love")) return "#ff00aa";
  if (t.includes("gold")) return "#ffcc00";
  return null;
}

// ----------------------------------------------
// 5. WORD-BASED ORB SIZE
// ----------------------------------------------
function getOrbScale(text) {
  if (text.length > 40) return "scale(1.4)";
  if (text.length < 10) return "scale(0.8)";
  return "scale(1)";
}

// ----------------------------------------------
// 6. WORD-BASED WORLD MOOD
// ----------------------------------------------
function detectWorldMood(text) {
  const t = text.toLowerCase();
  if (t.includes("angry")) return "angry";
  if (t.includes("happy")) return "happy";
  if (t.includes("sad")) return "sad";
  if (t.includes("dream")) return "dreamy";
  return null;
}

// ----------------------------------------------
// 7. WORD-BASED ORB MOVEMENT
// ----------------------------------------------
function applyMovementKeywords(orb, text) {
  const t = text.toLowerCase();
  if (t.includes("shake")) orb.classList.add("shake");
  if (t.includes("spin")) orb.classList.add("spin");
  if (t.includes("float")) orb.classList.add("float");
  if (t.includes("jump")) orb.classList.add("jump");
}

// ======================================================
// OVERRIDE addEchoToWorld WITHOUT BREAKING ORIGINAL
// ======================================================
const originalAddEchoToWorld = addEchoToWorld;

addEchoToWorld = function(echo, index = 0) {
  // run original behavior
  originalAddEchoToWorld(echo, index);

  // get the orb we just created
  const orb = container.lastElementChild;
  if (!orb) return;

  const text = echo.text || "";

  // store words
  storeWords(text);

  // mood detection
  const detectedMood = detectMoodFromText(text);
  if (detectedMood) {
    orb.dataset.mood = detectedMood;
    orb.style.color = {
      happy: "#00ffcc",
      sad: "#4466ff",
      angry: "#ff3366",
      dreamy: "#ff99ff",
      neutral: "#8a5bff"
    }[detectedMood];
  }

  // world mood
  const wm = detectWorldMood(text);
  if (wm) updateWorldBackground(wm);

  // orb size
  orb.style.transform = getOrbScale(text);

  // movement keywords
  applyMovementKeywords(orb, text);

  // word-triggered events
  Object.keys(wordTriggers).forEach(word => {
    if (text.toLowerCase().includes(word)) {
      wordTriggers[word]();
    }
  });

  // particle color override
  const specialColor = getParticleColor(text);
  if (specialColor) {
    orb.dataset.specialParticleColor = specialColor;
  }
};

// ======================================================
// PATCH PARTICLE BURST TO USE SPECIAL COLORS
// ======================================================
const oldSetTimeout = window.setTimeout;
window.setTimeout = function(fn, delay) {
  // intercept only the particle burst timeout
  if (fn.toString().includes("echo-particle")) {
    return oldSetTimeout(() => {
      const orb = container.lastElementChild;
      const special = orb?.dataset?.specialParticleColor;

      const particleCount = 26;
      for (let i = 0; i < particleCount; i++) {
        const p = document.createElement("div");
        p.className = "echo-particle";
        p.style.background = special || orb.style.color;

        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 40;

        p.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
        p.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);

        p.style.left = orb.style.left;
        p.style.top = orb.style.top;

        container.appendChild(p);
        setTimeout(() => p.remove(), 1200);
      }

      orb.remove();
    }, delay);
  }

  return oldSetTimeout(fn, delay);
};
