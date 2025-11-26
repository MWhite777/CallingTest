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

// -----------------------------
//  TRANSLATIONS
// -----------------------------
const translations = {
  en: {
    appTitle: "Firebase Video Call",
    languageLabel: "Language:",
    participantsTitle: "Participants",
    joinTitle: "Join or Start a Call",
    namePlaceholder: "Enter your name",
    roomPlaceholder: "Enter Room ID to join",
    joinCall: "Join Call",
    startCall: "Start New Call",
    roomReadyTitle: "Your Call is Ready!",
    roomReadyText: "Share this ID or link with others to join your call.",
    copyId: "Copy ID",
    copyLink: "Copy Link",
    close: "Close",
    mute: "Mute",
    unmute: "Unmute",
    stopVideo: "Stop Video",
    startVideo: "Start Video",
    endCall: "End Call",
    selfView: "Self View",
    qualityLabel: "Quality",
    qualityAuto: "Auto",
    quality480: "480p",
    quality720: "720p",
    quality1080: "1080p",
    quality2160: "4K",
    chatTitle: "Chat",
    chatTo: "To:",
    chatPlaceholder: "Type a message...",
    everyone: "Everyone",
    statusIdle: "idle",
    statusRequesting: "requesting media",
    statusReady: "media ready",
    statusCreated: "room created",
    statusJoined: "joined room",
    statusEnded: "idle",
    newMessageFrom: "New message from",
    imageMessage: "[image]"
  },
  ru: { 
    ... same as before ...
  }
};

let currentLanguage = "en";

// -----------------------------
//  DOM ELEMENTS
// -----------------------------
const videoGrid = document.getElementById("video-grid");
const joinModal = document.getElementById("join-modal");
const roomInfoModal = document.getElementById("room-info-modal");

const roomIdDisplay = document.getElementById("room-id-display");
const roomIdInput = document.getElementById("room-id-input");
const displayNameInput = document.getElementById("display-name-input");

const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");

const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");

const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const endCallBtn = document.getElementById("end-call-btn");
const selfViewBtn = document.getElementById("selfview-btn");

const resolutionSelect = document.getElementById("resolution-select");
const languageSelect = document.getElementById("language-select");

const chatPanel = document.getElementById("chat-panel");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatTargetSelect = document.getElementById("chat-target-select");
const chatNotification = document.getElementById("chat-notification");
const chatUnreadDot = document.getElementById("chat-unread-dot");

const emojiBtn = document.getElementById("emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");

const participantsList = document.getElementById("participants-list");
const subtitlesContainer = document.getElementById("subtitles-container");

// Status label setup (unchanged)
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

// Join code badge setup (unchanged)
let joinCodeBadge = document.getElementById("join-code-badge");
if (!joinCodeBadge) {
  joinCodeBadge = document.createElement("div");
  joinCodeBadge.id = "join-code-badge";
  joinCodeBadge.textContent = "CODE: ----";
  document.body.appendChild(joinCodeBadge);
}

// -----------------------------
//  STATE (unchanged)
// -----------------------------
let localStream = null;
let roomRef = null;
let roomId = null;
let clientId = null;
let participantsRef = null;
let myParticipantRef = null;
const peers = {};
const peerVAD = {};
let displayName = "";
const participantNames = {};
const CHAT_TARGET_PUBLIC = "__public__";
let chatListenersStarted = false;
let pinnedPeerId = null;
let selfViewMode = "small";
let audioCtx = null;
let desiredResolution = "auto";
const chatMessageElements = {};

// -----------------------------
//  ICE SERVERS (unchanged)
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
//  LANGUAGE + STATUS (unchanged)
// -----------------------------
function applyLanguage(lang) { ... }
function setStatus(text) { ... }

// -----------------------------
//  VIDEO / SELF VIEW / LAYOUT (unchanged)
// -----------------------------
function createVideoElement() { ... }
function updateVideoLayout() { ... }
function setupVoiceActivityForStream() { ... }

// ----------------------------------------------------
//  CHAT — UPDATED (REACTIONS REMOVED)
// ----------------------------------------------------
function addChatMessageToUI(msg, scope, msgId) {
  if (!chatMessages) return;

  const fromId = msg.fromId;
  const fromName = msg.fromName || participantNames[fromId] || fromId;
  const toId = msg.toId;

  const key = (scope || "public") + ":" + msgId;
  let wrapper = chatMessageElements[key];
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "chat-message";
    chatMessageElements[key] = wrapper;
    chatMessages.appendChild(wrapper);
  }

  wrapper.innerHTML = "";

  // -------- meta (NO REACTION UI) --------
  const metaEl = document.createElement("div");
  metaEl.className = "chat-message-meta";

  let metaText = "";
  const t = translations[currentLanguage];

  if (scope === "public") {
    metaText = `${fromName} → ${t.everyone}`;
  } else {
    if (fromId === clientId) {
      metaText = `You → ${participantNames[toId] || toId} (private)`;
    } else if (toId === clientId) {
      metaText = `${fromName} → You (private)`;
    } else {
      metaText = `${fromName} (private)`;
    }
  }

  const span = document.createElement("span");
  span.textContent = metaText;
  metaEl.appendChild(span);

  // -------- message text / image --------
  const textEl = document.createElement("div");
  textEl.className = "chat-message-text";

  if (msg.imageData) {
    const img = document.createElement("img");
    img.src = msg.imageData;
    img.alt = "image";
    textEl.appendChild(img);
  }

  if (msg.text) textEl.appendChild(document.createTextNode(msg.text));

  wrapper.appendChild(metaEl);
  wrapper.appendChild(textEl);

  chatMessages.scrollTop = chatMessages.scrollHeight;

  // notification if closed
  if (chatPanelIsHidden() && fromId !== clientId) {
    showChatNotification(fromName, msg.text || t.imageMessage);
  }
}

// EVERYTHING ELSE BELOW REMAINS THE SAME —
// Room logic, WebRTC, joining, chat sending,
// emoji picker, drag & drop, events, etc.
// -----------------------------
// -----------------------------
