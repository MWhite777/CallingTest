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

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");
const subtitlesContainer = document.getElementById("subtitles-container");


// -----------------------------
//  STATUS LABEL
// -----------------------------
let statusLabel = document.getElementById("status-label");
if (!statusLabel) {
  statusLabel = document.createElement("div");
  statusLabel.id = "status-label";
  statusLabel.style = `
    position: fixed;
    left: 10px;
    bottom: 60px;
    color: #ccc;
    font-size: 12px;
    font-family: monospace;
  `;
  statusLabel.textContent = "Status: idle";
  document.body.appendChild(statusLabel);
}


// -----------------------------
// JOIN CODE BADGE
// -----------------------------
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

let inactivityTimer = null; // <--- NEW: room cleanup timer

const peers = {};

let userSelectedLanguage = "en";
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", (e) => {
    userSelectedLanguage = e.target.value || "en";
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
  if (statusLabel) statusLabel.textContent = "Status: " + text;
  console.log("[Status]", text);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function clearVideos() {
  if (videoGrid) videoGrid.innerHTML = "";
}

function updateJoinCodeBadge() {
  joinCodeBadge.textContent = roomId ? `CODE: ${roomId}` : "CODE: ----";
}


// -----------------------------
//  ROOM CLEANUP LOGIC (new)
// -----------------------------
function startEmptyRoomTimer() {
  if (!roomRef || !roomId) return;

  console.log("[Cleanup] Starting 10‑minute empty room timer…");
  setStatus("empty room timer started");

  inactivityTimer = setTimeout(async () => {
    console.log("[Cleanup] Room empty for 10 minutes → deleting:", roomId);
    setStatus("deleting inactive room");

    try {
      await roomRef.remove();
      console.log("[Cleanup] Room deleted:", roomId);
    } catch (err) {
      console.error("[Cleanup] Error deleting room:", err);
    }
  }, 10 * 60 * 1000); // 10 minutes
}

function cancelEmptyRoomTimer() {
  if (inactivityTimer) {
    console.log("[Cleanup] Cancelled empty room timer.");
    setStatus("room active");
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
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
    alert("Could not access camera/microphone.");
    setStatus("media error");
    throw err;
  }
}

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) {
    video = document.createElement("video");
    video.id = "video-local";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.classList.add("local-video");
    videoGrid.appendChild(video);
  }
  video.srcObject = stream;
}


// -----------------------------
//  REMOTE VIDEO HANDLING
// -----------------------------
function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const id = "remote-" + peerId;
    const video = document.createElement("video");
    video.id = id;
    video.autoplay = true;
    video.playsInline = true;
    video.classList.add("remote-video");
    videoGrid.appendChild(video);
    peer.videoEl = video;
  }

  peer.videoEl.srcObject = stream;
}


// -----------------------------
//  WEBRTC & SIGNALING
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;

  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();

  peers[peerId] = { pc, remoteStream, videoEl: null };

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    peers[peerId].remoteStream = remoteStream;
    addRemoteVideo(peerId, remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    roomRef
      .child("signals")
      .child(peerId)
      .child(clientId)
      .child("ice")
      .push(event.candidate.toJSON());
  };

  return pc;
}


// -----------------------------
//  PARTICIPANTS MANAGEMENT
// -----------------------------
function initRoomInfra() {
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;

  myParticipantRef.set({
    joinedAt: Date.now(),
    lang: userSelectedLanguage
  });

  myParticipantRef.onDisconnect().remove();

  // Monitor participant changes
  participantsRef.on("value", (snap) => {
    const count = snap.numChildren();
    console.log("[Room] Participant count:", count);

    if (count === 0) startEmptyRoomTimer();
    else cancelEmptyRoomTimer();
  });

  // Connecting to peers
  participantsRef.on("child_added", (snap) => {
    const pid = snap.key;
    if (pid === clientId) return;

    if (clientId > pid) {
      connectToPeer(pid);
    }
  });

  participantsRef.on("child_removed", (snap) => {
    cleanupPeer(snap.key);
  });

  startChatListener();
}


// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  try {
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);

    await roomRef.set({ createdAt: Date.now() });

    await startLocalMedia();
    initRoomInfra();

    joinModal.style.display = "none";
    endCallBtn.classList.remove("hidden");
    showRoomInfoModal();
    updateJoinCodeBadge();

  } catch (err) {
    console.error(err);
  }
}


// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  const snapshot = await database.ref(`rooms/${id}`).once("value");
  if (!snapshot.exists()) {
    alert("Room does not exist.");
    return;
  }

  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");
  updateJoinCodeBadge();
}


// -----------------------------
//  END CALL
// -----------------------------
async function endCall() {
  Object.values(peers).forEach((p) => {
    if (p.pc) p.pc.close();
    if (p.videoEl) p.videoEl.remove();
  });

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }

  if (myParticipantRef) myParticipantRef.remove();

  if (roomRef) roomRef.off();

  clearVideos();
  roomId = null;
  roomRef = null;
  clientId = null;

  updateJoinCodeBadge();

  joinModal.style.display = "flex";
  roomInfoModal.style.display = "none";
  endCallBtn.classList.add("hidden");
}


// -----------------------------
//  BUTTON EVENTS
// -----------------------------
startCallBtn.addEventListener("click", createRoom);
joinCallBtn.addEventListener("click", () => joinRoomById(roomIdInput.value.trim()));
endCallBtn.addEventListener("click", endCall);

copyIdBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(roomId);
});

copyLinkBtn.addEventListener("click", () => {
  const url = `${location.origin}?room=${roomId}`;
  navigator.clipboard.writeText(url);
});

closeRoomInfoBtn.addEventListener("click", () => {
  roomInfoModal.style.display = "none";
});


// -----------------------------
//  AUTO-JOIN VIA URL
// -----------------------------
window.addEventListener("load", () => {
  const p = new URLSearchParams(location.search);
  const r = p.get("room");
  if (r) {
    roomIdInput.value = r;
    joinRoomById(r);
  }
});
