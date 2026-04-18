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
    orb.style.transition = "opacity 3s ease, transform 3s ease";
    orb.style.opacity = "0";
    orb.style.transform += " scale(0.4)";
    setTimeout(() => orb.remove(), 3000);
  }, 20000);

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
