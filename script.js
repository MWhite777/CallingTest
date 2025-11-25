// -----------------------------
//  Firebase Initialization
// -----------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDl1rBlKbZezkdPHQovpXR_QZ_1v2w-sQg", // <-- replace if you rotated it
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

// Optional chat / participants / language UI (won't crash if missing)
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");

// Simple subtitles container (optional)
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

// Join code bubble (bottom-left, solid light blue)
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

// Multi‑peer state
let clientId = null;          // this client's unique id inside the room
let participantsRef = null;   // rooms/{roomId}/participants
let myParticipantRef = null;  // rooms/{roomId}/participants/{clientId}

// peerId -> { pc, remoteStream, videoEl, signalHandlersAttached? }
const peers = {};

// language preference for translations (default english)
let userSelectedLanguage = "en";
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", (e) => {
    userSelectedLanguage = e.target.value || "en";
  });
}

// -----------------------------
//  ICE SERVERS (STUN + TURN)
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

// update join-code bubble text
function updateJoinCodeBadge() {
  if (!joinCodeBadge) return;
  if (roomId) {
    joinCodeBadge.textContent = `CODE: ${roomId}`;
  } else {
    joinCodeBadge.textContent = "CODE: ----";
  }
}

// fullscreen remote when only 1 remote
function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  if (remoteVideos.length === 1) {
    remoteVideos.forEach(v => v.classList.add("remote-fullscreen"));
  } else {
    remoteVideos.forEach(v => v.classList.remove("remote-fullscreen"));
  }
}

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
  if (!videoGrid) return;
  let video = document.getElementById("video-local");
  if (!video) {
    video = createVideoElement("video-local", true);
  }
  video.srcObject = stream;
}

function addRemoteVideo(peerId, stream) {
  if (!videoGrid) return;
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const id = "remote-" + peerId;
    let video = document.getElementById(id);
    if (!video) {
      video = createVideoElement(id, false);
      video.classList.add("remote-video");
    }
    peer.videoEl = video;
  }
  peer.videoEl.srcObject = stream;
  const playPromise = peer.videoEl.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn("[RemoteVideo] play() blocked:", err);
    });
  }
  updateVideoLayout(); // adjust fullscreen vs multi layout
}

function showRoomInfoModal() {
  if (!roomId || !roomInfoModal || !roomIdDisplay) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
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
    console.log("[Media] Got local stream");
    addLocalVideo(localStream);
    setStatus("media ready");
    return localStream;
  } catch (err) {
    console.error("[Media] Error accessing devices:", err);
    alert("Could not access camera/microphone.");
    setStatus("media error");
    throw err;
  }
}

// -----------------------------
//  MULTI‑PEER WEBRTC
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;
  console.log("[WebRTC] Creating RTCPeerConnection for peer:", peerId);
  setStatus("creating peer " + peerId);
  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();
  peers[peerId] = {
    ...(peers[peerId] || {}),
    pc,
    remoteStream,
    videoEl: peers[peerId]?.videoEl || null
  };
  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }
  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    console.log("[WebRTC] iceConnectionState for", peerId, ":", s);
    setStatus("ice(" + peerId + "): " + s);
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connectionState for", peerId, ":", s);
    setStatus("conn(" + peerId + "): " + s);
  };
  // Remote tracks
  pc.ontrack = (event) => {
    console.log("[WebRTC] Got remote track from", peerId);
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    peers[peerId].remoteStream = remoteStream;
    addRemoteVideo(peerId, remoteStream);
  };
  // ICE candidates -> Firebase signaling (to peerId, from me)
  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    console.log("[WebRTC] ICE candidate for", peerId);
    signalsRef.child("ice").push(event.candidate.toJSON());
  };
  return pc;
}

async function connectToPeer(peerId) {
  try {
    console.log("[WebRTC] connectToPeer", peerId);
    const pc = createPeerConnectionForPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    await signalsRef.child("offer").set({
      type: offer.type,
      sdp: offer.sdp
    });
    console.log("[WebRTC] Sent offer to", peerId);
  } catch (err) {
    console.error("[WebRTC] Error connecting to peer", peerId, err);
  }
}

// Handle incoming offers/answers/ICE for a given peer
function setupSignalHandlersForPeer(fromId, fromRef) {
  // Prevent double attaching
  if (peers[fromId]?.signalHandlersAttached) return;
  peers[fromId] = peers[fromId] || {};
  peers[fromId].signalHandlersAttached = true;
  // Offer (we are callee)
  fromRef.child("offer").on("value", async (snap) => {
    const offer = snap.val();
    if (!offer) return;
    console.log("[Signal] Got offer from", fromId);
    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const backRef = roomRef.child("signals").child(fromId).child(clientId);
      await backRef.child("answer").set({
        type: answer.type,
        sdp: answer.sdp
      });
      console.log("[Signal] Sent answer to", fromId);
    }
  });
  // Answer (we are caller)
  fromRef.child("answer").on("value", async (snap) => {
    const answer = snap.val();
    if (!answer) return;
    console.log("[Signal] Got answer from", fromId);
    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription || pc.currentRemoteDescription.type !== "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });
  // ICE candidates
  fromRef.child("ice").on("child_added", (snap) => {
    const cand = snap.val();
    if (!cand) return;
    const pc = createPeerConnectionForPeer(fromId);
    const candidate = new RTCIceCandidate(cand);
    pc.addIceCandidate(candidate).catch((err) => {
      console.error("[Signal] Error adding ICE from", fromId, err);
    });
  });
}

// -----------------------------
//  PARTICIPANTS (CONTACT LIST)
// -----------------------------
function addParticipantToUI(id) {
  if (!participantsList) return;
  let li = document.getElementById("user-" + id);
  if (!li) {
    li = document.createElement("li");
    li.id = "user-" + id;
    li.textContent = id === clientId ? id + " (You)" : id;
    participantsList.appendChild(li);
  }
}

function removeParticipantFromUI(id) {
  if (!participantsList) return;
  const li = document.getElementById("user-" + id);
  if (li) li.remove();
}

function cleanupPeer(peerId) {
  const peer = peers[peerId];
  if (!peer) return;
  if (peer.pc) {
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.close();
    } catch (e) {
      console.warn(e);
    }
  }
  if (peer.remoteStream) {
    peer.remoteStream.getTracks().forEach((t) => t.stop());
  }
  if (peer.videoEl) {
    peer.videoEl.remove();
  }
  delete peers[peerId];
  updateVideoLayout(); // recalc layout after someone leaves
}

// -----------------------------
//  ROOM CHAT + TRANSLATION
// -----------------------------
function addChatMessageToUI(msg) {
  if (!chatMessages) {
    console.warn("[Chat] chatMessages element missing");
    return;
  }
  const div = document.createElement("div");
  div.textContent = `${msg.sender}: ${msg.text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage(text) {
  if (!roomRef) return;
  const message = {
    sender: clientId || "anon",
    text,
    ts: Date.now()
  };
  roomRef.child("chat").push(message);
}

// LibreTranslate API
async function translateText(text, targetLang = "en") {
  try {
    const res = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      })
    });
    const data = await res.json();
    if (data && data.translatedText) return data.translatedText;
    return text;
  } catch (err) {
    console.error("[Translate] Error:", err);
    return text; // fallback: original text
  }
}

function startChatListener() {
  if (!roomRef) return;
  roomRef.child("chat").on("child_added", async (snap) => {
    const msg = snap.val();
    if (!msg) return;
    const translated = await translateText(msg.text, userSelectedLanguage);
    addChatMessageToUI({
      sender: msg.sender,
      text: translated
    });
    if (subtitlesContainer) {
      subtitlesContainer.textContent = `${msg.sender}: ${translated}`;
    }
  });
}

if (chatSendBtn && chatInput) {
  chatSendBtn.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (text !== "") {
      sendChatMessage(text);
      chatInput.value = "";
    }
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      chatSendBtn.click();
    }
  });
}

// -----------------------------
//  ROOM PRESENCE + SIGNALING
// -----------------------------
function initRoomInfra() {
  if (!roomRef) return;
  // PARTICIPANTS
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;
  console.log("[Room] My clientId:", clientId);
  myParticipantRef.set({
    lang: userSelectedLanguage,
    joinedAt: Date.now()
  });
  myParticipantRef.onDisconnect().remove();

  // When a participant joins
  participantsRef.on("child_added", (snap) => {
    const pid = snap.key;
    if (!pid) return;
    addParticipantToUI(pid);
    if (pid === clientId) return;
    // Only one side initiates connection -> lexicographic rule
    if (clientId > pid) {
      connectToPeer(pid);
    }
  });

  // When a participant leaves
  participantsRef.on("child_removed", (snap) => {
    const pid = snap.key;
    if (!pid) return;
    removeParticipantFromUI(pid);
    cleanupPeer(pid);
  });

  // SIGNALING (everything targeted "to me")
  const mySignalsRef = roomRef.child("signals").child(clientId);
  mySignalsRef.on("child_added", (snap) => {
    const fromId = snap.key;
    const fromRef = snap.ref;
    console.log("[Signal] New signal branch from", fromId);
    setupSignalHandlersForPeer(fromId, fromRef);
  });

  // CHAT
  startChatListener();
}

// -----------------------------
//  CALL FLOW - CREATE ROOM
// -----------------------------
async function createRoom() {
  try {
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);
    console.log("[Room] Creating room:", roomId);
    setStatus("creating room " + roomId);
    await roomRef.set({
      createdAt: Date.now()
    });
    await startLocalMedia();
    initRoomInfra();
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    showRoomInfoModal();
    updateJoinCodeBadge();
    setStatus("room created: " + roomId);
  } catch (err) {
    console.error("[Room] Error creating room:", err);
    setStatus("error creating room");
  }
}

// -----------------------------
//  CALL FLOW - JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  if (!id) {
    alert("Please enter a Room ID.");
    return;
  }
  try {
    console.log("[Room] Trying to join room:", id);
    setStatus("joining room " + id);
    const roomSnapshot = await database.ref(`rooms/${id}`).once("value");
    if (!roomSnapshot.exists()) {
      alert("Session does not exist.");
      console.log("[Room] Room not found in DB");
      setStatus("room not found");
      return;
    }
    roomId = id;
    roomRef = database.ref(`rooms/${roomId}`);
    await startLocalMedia();
    initRoomInfra();
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    updateJoinCodeBadge();
    setStatus("joined room " + roomId);
  } catch (err) {
    console.error("[Room] Error joining room:", err);
    setStatus("error joining room");
  }
}

// -----------------------------
//  END CALL / CLEANUP
// -----------------------------
async function endCall() {
  console.log("[Call] Ending call");
  setStatus("ending call");
  try {
    Object.keys(peers).forEach((pid) => cleanupPeer(pid));
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    clearVideos();
    if (myParticipantRef) {
      try {
        await myParticipantRef.remove();
      } catch (e) {
        console.warn("[Call] Error removing participant:", e);
      }
      myParticipantRef = null;
    }
    if (roomRef && roomId) {
      try {
        roomRef.off();
      } catch (err) {
        console.warn("[Call] Error cleaning room listeners:", err);
      }
    }
    roomRef = null;
    roomId = null;
    clientId = null;
    updateJoinCodeBadge();
    if (joinModal) joinModal.style.display = "flex";
    if (roomInfoModal) roomInfoModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.add("hidden");
    if (roomIdInput) roomIdInput.value = "";
    setStatus("idle");
  } catch (err) {
    console.error("[Call] Error ending call:", err);
    setStatus("error ending call");
  }
}

// -----------------------------
//  BUTTON EVENTS
// -----------------------------
if (startCallBtn) {
  startCallBtn.addEventListener("click", () => {
    createRoom().catch(console.error);
  });
}
if (joinCallBtn) {
  joinCallBtn.addEventListener("click", () => {
    const inputRoomId = roomIdInput ? roomIdInput.value.trim() : "";
    joinRoomById(inputRoomId).catch(console.error);
  });
}
if (endCallBtn) {
  endCallBtn.addEventListener("click", () => {
    endCall();
  });
}
if (copyIdBtn) {
  copyIdBtn.addEventListener("click", () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      const originalText = copyIdBtn.textContent;
      copyIdBtn.textContent = "Copied!";
      setTimeout(() => {
        copyIdBtn.textContent = originalText;
      }, 2000);
    });
  });
}
if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", () => {
    if (!roomId) return;
    const roomUrl = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
      const originalText = copyLinkBtn.textContent;
      copyLinkBtn.textContent = "Link Copied!";
      setTimeout(() => {
        copyLinkBtn.textContent = originalText;
      }, 2000);
    });
  });
}
if (closeRoomInfoBtn) {
  closeRoomInfoBtn.addEventListener("click", () => {
    if (roomInfoModal) roomInfoModal.style.display = "none";
  });
}

// Mute / Unmute
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const enabled = audioTrack.enabled;
    audioTrack.enabled = !enabled;
    muteBtn.innerHTML = enabled
      ? '<i class="fas fa-microphone-slash"></i><span>Unmute</span>'
      : '<i class="fas fa-microphone"></i><span>Mute</span>';
  });
}

// Toggle Video
if (videoBtn) {
  videoBtn.addEventListener("click", () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const enabled = videoTrack.enabled;
    videoTrack.enabled = !enabled;
    videoBtn.innerHTML = enabled
      ? '<i class="fas fa-video-slash"></i><span>Start Video</span>'
      : '<i class="fas fa-video"></i><span>Stop Video</span>';
  });
}

// Cleanup when leaving page
window.addEventListener("beforeunload", () => {
  try {
    Object.keys(peers).forEach((pid) => cleanupPeer(pid));
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (myParticipantRef) {
      myParticipantRef.remove();
    }
  } catch (e) {
    console.warn(e);
  }
});

// Auto-join if ?room=ID in URL
window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomId = urlParams.get("room");
  if (urlRoomId && roomIdInput) {
    roomIdInput.value = urlRoomId;
    joinRoomById(urlRoomId).catch(console.error);
  }
});
