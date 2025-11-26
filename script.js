// -----------------------------
//  Firebase Initialization
// -----------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDl1rBlKbZezkdPHQovpXR_QZ_1v2w-sQg",
  authDomain: "my-calling-test.firebaseapp.com",
  databaseURL: "https://my-calling-test-default-rtdb.firebaseio.com",
  projectId: "my-calling-test",
  storageBucket: "my-calling-test.firebasestorage.app",
  messagingSenderId: "222289306242",
  appId: "1:222289306242:web:e841cbc95876665d324a9b",
  measurementId: "G-TW6X4N95L5"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log("[Firebase] Initialized");

// -----------------------------
//  DOM ELEMENTS
// -----------------------------
const videoGrid = document.getElementById("video-grid");
const joinModal = document.getElementById("join-modal");
const roomInfoModal = document.getElementById("room-info-modal");
const roomIdDisplay = document.getElementById("room-id-display");
const roomIdInput = document.getElementById("room-id-input");
const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");
const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const endCallBtn = document.getElementById("end-call-btn");

// Optional chat / participants UI
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");
const subtitlesContainer = document.getElementById("subtitles-container");

// Status label
let statusLabel = document.getElementById("status-label");
if (!statusLabel) {
  statusLabel = document.createElement("div");
  statusLabel.id = "status-label";
  statusLabel.style.position = "fixed";
  statusLabel.style.left = "10px";
  statusLabel.style.bottom = "60px";
  statusLabel.style.color = "#ccc";
  statusLabel.style.fontSize = "12px";
  statusLabel.style.fontFamily = "monospace";
  statusLabel.textContent = "Status: idle";
  document.body.appendChild(statusLabel);
}

// Join-code floating badge
let joinCodeBadge = document.getElementById("join-code-badge");
if (!joinCodeBadge) {
  joinCodeBadge = document.createElement("div");
  joinCodeBadge.id = "join-code-badge";
  joinCodeBadge.textContent = "CODE: ----";
  document.body.appendChild(joinCodeBadge);
}

// -----------------------------
//  STATE
// -----------------------------
let localStream = null;
let roomRef = null;
let roomId = null;
let clientId = null;

let participantsRef = null;
let myParticipantRef = null;

const peers = {};

let userSelectedLanguage = "en";
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", e => {
    userSelectedLanguage = e.target.value;
  });
}

// -----------------------------
//  ICE SERVERS
// -----------------------------
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:relay1.expressturn.com:3480",
      username: "000000002079386592",
      credential: "u1xEd/GlKAOmVY4fK+azNX8vbIY="
    }
  ]
};

// -----------------------------
//  HELPERS
// -----------------------------
function setStatus(text) {
  statusLabel.textContent = "Status: " + text;
  console.log("[Status]", text);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function updateJoinCodeBadge() {
  joinCodeBadge.textContent = roomId ? `CODE: ${roomId}` : "CODE: ----";
}

// -----------------------------
//  MEDIA
// -----------------------------
async function startLocalMedia() {
  if (localStream) return localStream;
  try {
    setStatus("requesting media");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    addLocalVideo(localStream);
    setStatus("media ready");
    return localStream;
  } catch (err) {
    alert("Could not access camera/mic");
    throw err;
  }
}

function createVideoElement(id, isLocal = false) {
  const video = document.createElement("video");
  video.id = id;
  video.autoplay = true;
  video.playsInline = true;
  if (isLocal) video.muted = true;
  videoGrid.appendChild(video);
  return video;
}

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
}

// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  try {
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);
    await roomRef.set({ createdAt: Date.now() });

    // 🔥 UPDATE URL AUTOMATICALLY
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    window.history.replaceState({}, "", newUrl);

    await startLocalMedia();
    initRoomInfra();

    joinModal.style.display = "none";
    endCallBtn.classList.remove("hidden");

    updateJoinCodeBadge();
    roomIdDisplay.textContent = roomId;
    roomInfoModal.style.display = "flex";

    setStatus("room created " + roomId);
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  if (!id) return alert("Enter a room ID");

  const exists = await database.ref(`rooms/${id}`).once("value");
  if (!exists.exists()) return alert("Session does not exist.");

  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);

  // 🔥 UPDATE URL WHEN JOINING
  const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  window.history.replaceState({}, "", newUrl);

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();
  setStatus("joined room " + roomId);
}

// -----------------------------
//  All other functions remain unchanged
//  (WebRTC, signaling, participants, chat, cleanup, etc.)
// -----------------------------

// -----------------------------
//  EVENT LISTENERS
// -----------------------------
startCallBtn?.addEventListener("click", () => createRoom());
joinCallBtn?.addEventListener("click", () => joinRoomById(roomIdInput.value.trim()));

copyIdBtn?.addEventListener("click", () => {
  navigator.clipboard.writeText(roomId);
});

copyLinkBtn?.addEventListener("click", () => {
  const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(link);
});

// Auto-join if ?room= is in the URL
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("room");
  if (id) {
    roomIdInput.value = id;
    joinRoomById(id);
  }
});
