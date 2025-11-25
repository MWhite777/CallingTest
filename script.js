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

// Join bubble bottom-left
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
  statusLabel.textContent = "Status: " + text;
  console.log("[Status]", text);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function clearVideos() {
  videoGrid.innerHTML = "";
}

function updateJoinCodeBadge() {
  joinCodeBadge.textContent = roomId ? `CODE: ${roomId}` : "CODE: ----";
}

/*  
    FIXED LAYOUT LOGIC  
    - If ONLY 1 remote video ⇒ fullscreen  
    - If 2+ remote videos ⇒ switch to grid mode  
*/

function updateVideoLayout() {
  const remotes = videoGrid.querySelectorAll("video.remote-video");

  if (remotes.length === 1) {
    // fullscreen one
    remotes.forEach(v => {
      v.classList.add("remote-fullscreen");
      v.classList.remove("remote-grid-box");
    });
  } else {
    // grid mode
    remotes.forEach(v => {
      v.classList.remove("remote-fullscreen");
      v.classList.add("remote-grid-box");
    });
  }
}

// -----------------------------
//  VIDEO ELEMENT CREATION
// -----------------------------
function createVideoElement(id, isLocal = false) {
  const video = document.createElement("video");
  video.id = id;
  video.autoplay = true;
  video.playsInline = true;

  if (isLocal) {
    video.muted = true;
    video.classList.add("local-video");
  }

  videoGrid.appendChild(video);
  return video;
}

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
}

function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];

  if (!peer.videoEl) {
    let video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.classList.add("remote-video");
    video.id = "remote-" + peerId;
    videoGrid.appendChild(video);
    peer.videoEl = video;
  }

  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(() => {});
  updateVideoLayout();
}

// -----------------------------
//  MEDIA
// -----------------------------
async function startLocalMedia() {
  if (localStream) return localStream;
  try {
    setStatus("requesting media");
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addLocalVideo(localStream);
    setStatus("media ready");
    return localStream;
  } catch (err) {
    alert("Could not access camera/microphone.");
    throw err;
  }
}

// -----------------------------
//  PEER CONNECTIONS
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;

  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();

  peers[peerId] = { ...(peers[peerId] || {}), pc, remoteStream };

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    peers[peerId].remoteStream = remoteStream;
    addRemoteVideo(peerId, remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    roomRef.child("signals").child(peerId).child(clientId).child("ice").push(event.candidate.toJSON());
  };

  return pc;
}

async function connectToPeer(peerId) {
  const pc = createPeerConnectionForPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  roomRef.child("signals").child(peerId).child(clientId).child("offer").set({
    type: offer.type,
    sdp: offer.sdp
  });
}

// -----------------------------
//  SIGNALING HANDLERS
// -----------------------------
function setupSignalHandlersForPeer(fromId, fromRef) {
  if (peers[fromId]?.signalHandlersAttached) return;
  peers[fromId] = peers[fromId] || {};
  peers[fromId].signalHandlersAttached = true;

  fromRef.child("offer").on("value", async (snap) => {
    const offer = snap.val();
    if (!offer) return;

    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      roomRef.child("signals").child(fromId).child(clientId).child("answer").set({
        type: answer.type,
        sdp: answer.sdp
      });
    }
  });

  fromRef.child("answer").on("value", async (snap) => {
    const answer = snap.val();
    if (!answer) return;

    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription || pc.currentRemoteDescription.type !== "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  fromRef.child("ice").on("child_added", (snap) => {
    const cand = snap.val();
    if (!cand) return;

    const pc = createPeerConnectionForPeer(fromId);
    pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
  });
}

// -----------------------------
//  PARTICIPANTS
// -----------------------------
function cleanupPeer(peerId) {
  const peer = peers[peerId];
  if (!peer) return;

  if (peer.pc) {
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
  }

  if (peer.videoEl) peer.videoEl.remove();
  delete peers[peerId];
  updateVideoLayout();
}

// -----------------------------
//  CHAT + TRANSLATION
// -----------------------------
function startChatListener() {
  if (!roomRef) return;
  roomRef.child("chat").on("child_added", async (snap) => {
    const msg = snap.val();
    if (!msg) return;

    const translated = await translateText(msg.text, userSelectedLanguage);

    if (chatMessages) {
      const d = document.createElement("div");
      d.textContent = `${msg.sender}: ${translated}`;
      chatMessages.appendChild(d);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (subtitlesContainer) {
      subtitlesContainer.textContent = `${msg.sender}: ${translated}`;
    }
  });
}

async function translateText(text, targetLang = "en") {
  try {
    const res = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "auto", target: targetLang })
    });
    const data = await res.json();
    return data.translatedText || text;
  } catch {
    return text;
  }
}

// -----------------------------
//  ROOM HANDLING
// -----------------------------
function initRoomInfra() {
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;

  myParticipantRef.set({ lang: userSelectedLanguage, joinedAt: Date.now() });
  myParticipantRef.onDisconnect().remove();

  participantsRef.on("child_added", (snap) => {
    const pid = snap.key;
    if (pid === clientId) return;

    if (clientId > pid) connectToPeer(pid);
  });

  participantsRef.on("child_removed", (snap) => {
    cleanupPeer(snap.key);
  });

  // handle signals to me
  roomRef.child("signals").child(clientId).on("child_added", (snap) => {
    setupSignalHandlersForPeer(snap.key, snap.ref);
  });

  startChatListener();
}

async function createRoom() {
  roomId = generateRoomId();
  roomRef = database.ref(`rooms/${roomId}`);
  await roomRef.set({ createdAt: Date.now() });

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";

  updateJoinCodeBadge();
  setStatus("room created");
}

async function joinRoomById(id) {
  const snap = await database.ref(`rooms/${id}`).once("value");
  if (!snap.exists()) {
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

async function endCall() {
  Object.keys(peers).forEach(cleanupPeer);

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  if (myParticipantRef) myParticipantRef.remove();
  if (roomRef) roomRef.off();

  roomRef = null;
  roomId = null;
  clientId = null;
  clearVideos();
  updateJoinCodeBadge();

  joinModal.style.display = "flex";
  roomInfoModal.style.display = "none";
  endCallBtn.classList.add("hidden");

  setStatus("idle");
}

// -----------------------------
//  UI BUTTONS
// -----------------------------
startCallBtn.onclick = () => createRoom();
joinCallBtn.onclick = () => joinRoomById(roomIdInput.value.trim());
endCallBtn.onclick = () => endCall();

copyIdBtn.onclick = () => {
  if (!roomId) return;
  navigator.clipboard.writeText(roomId);
};

copyLinkBtn.onclick = () => {
  if (!roomId) return;
  navigator.clipboard.writeText(`${location.origin}?room=${roomId}`);
};

closeRoomInfoBtn.onclick = () => {
  roomInfoModal.style.display = "none";
};

muteBtn.onclick = () => {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
};

videoBtn.onclick = () => {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
};

window.addEventListener("beforeunload", () => {
  Object.keys(peers).forEach(cleanupPeer);
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (myParticipantRef) myParticipantRef.remove();
});

// Auto join via URL
window.addEventListener("load", () => {
  const r = new URLSearchParams(window.location.search).get("room");
  if (r) {
    roomIdInput.value = r;
    joinRoomById(r);
  }
});
