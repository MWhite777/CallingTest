// -----------------------------
//  Firebase Initialization
// -----------------------------
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const displayNameInput = document.getElementById("display-name-input");
const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");
const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const endCallBtn = document.getElementById("end-call-btn");

// Chat elements
const chatPanel = document.getElementById("chat-panel");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatTargetSelect = document.getElementById("chat-target-select");

const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");
const subtitlesContainer = document.getElementById("subtitles-container");


// -----------------------------
//  STATUS LABEL + JOIN CODE BADGE
// -----------------------------
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

let displayName = "";
const participantNames = {};
const CHAT_TARGET_PUBLIC = "__public__";
let chatListenersStarted = false;


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

function updateVideoLayout() {
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => v.classList.remove("fullscreen-remote"));
  if (remoteVideos.length === 1) {
    remoteVideos[0].classList.add("fullscreen-remote");
  }
}

function createVideoElement(id, isLocal = false) {
  const v = document.createElement("video");
  v.id = id;
  v.autoplay = true;
  v.playsInline = true;
  if (isLocal) {
    v.muted = true;
    v.classList.add("local-video");
  }
  videoGrid.appendChild(v);
  return v;
}

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
}

function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const v = createVideoElement("remote-" + peerId, false);
    v.classList.add("remote-video");
    peer.videoEl = v;
  }
  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(err => console.warn("play blocked", err));
  updateVideoLayout();
}


// -----------------------------
//  LOCAL MEDIA
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
    console.error(err);
    alert("Could not access camera/microphone.");
    throw err;
  }
}


// -----------------------------
//  WEBRTC PEERS
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;

  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();
  peers[peerId] = { pc, remoteStream, videoEl: null };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    addRemoteVideo(peerId, remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && roomRef && clientId) {
      roomRef.child("signals").child(peerId).child(clientId)
        .child("ice").push(event.candidate.toJSON());
    }
  };

  return pc;
}

async function connectToPeer(peerId) {
  const pc = createPeerConnectionForPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  roomRef.child("signals")
    .child(peerId)
    .child(clientId)
    .child("offer")
    .set({ type: offer.type, sdp: offer.sdp });
}

function setupSignalHandlersForPeer(fromId, fromRef) {
  fromRef.child("offer").on("value", async snap => {
    const offer = snap.val();
    if (!offer) return;
    const pc = createPeerConnectionForPeer(fromId);

    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      roomRef.child("signals")
        .child(fromId)
        .child(clientId)
        .child("answer")
        .set({ type: answer.type, sdp: answer.sdp });
    }
  });

  fromRef.child("answer").on("value", async snap => {
    const ans = snap.val();
    if (!ans) return;
    const pc = createPeerConnectionForPeer(fromId);

    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(ans));
    }
  });

  fromRef.child("ice").on("child_added", snap => {
    const cand = snap.val();
    if (!cand) return;
    const pc = createPeerConnectionForPeer(fromId);
    pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
  });
}


// -----------------------------
//  PARTICIPANTS + CHAT TARGETS
// -----------------------------
function rebuildChatTargetSelect() {
  chatTargetSelect.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = CHAT_TARGET_PUBLIC;
  optAll.textContent = "Everyone";
  chatTargetSelect.appendChild(optAll);

  Object.keys(participantNames).forEach(id => {
    const name = participantNames[id] || id;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id === clientId ? `${name} (You)` : name;
    chatTargetSelect.appendChild(opt);
  });
}

function addParticipantToUI(id, data) {
  const name = (data && data.name) || id;
  participantNames[id] = name;

  if (participantsList) {
    let li = document.getElementById("user-" + id);
    if (!li) {
      li = document.createElement("li");
      li.id = "user-" + id;
      li.textContent = id === clientId ? `${name} (You)` : name;
      participantsList.appendChild(li);
    } else {
      li.textContent = id === clientId ? `${name} (You)` : name;
    }
  }

  rebuildChatTargetSelect();
}

function removeParticipantFromUI(id) {
  delete participantNames[id];
  const li = document.getElementById("user-" + id);
  if (li) li.remove();
  rebuildChatTargetSelect();
}

function cleanupPeer(peerId) {
  const p = peers[peerId];
  if (!p) return;
  if (p.pc) p.pc.close();
  if (p.videoEl) p.videoEl.remove();
  delete peers[peerId];
  updateVideoLayout();
}


// -----------------------------
//  ROOM AUTO DELETE
// -----------------------------
function startRoomEmptyWatcher() {
  if (!roomRef || !participantsRef) return;

  const EMPTY_TIMEOUT = 10 * 60 * 1000;
  let emptySince = null;

  participantsRef.on("value", (snap) => {
    const participants = snap.val();
    const count = participants ? Object.keys(participants).length : 0;

    if (count === 0) {
      if (!emptySince) emptySince = Date.now();
      if (Date.now() - emptySince > EMPTY_TIMEOUT) {
        roomRef.remove();
      }
    } else {
      emptySince = null;
    }
  });
}


// -----------------------------
//  CHAT (PUBLIC + PRIVATE)
// -----------------------------
function addChatMessageToUI(msg, scope) {
  const fromId = msg.fromId || "unknown";
  const fromName = msg.fromName || participantNames[fromId] || fromId;
  const toId = msg.toId || null;

  let meta = "";
  if (scope === "public") {
    meta = `${fromName} → Everyone`;
  } else {
    if (fromId === clientId && toId) {
      const toName = participantNames[toId] || toId;
      meta = `You → ${toName} (private)`;
    } else if (toId === clientId) {
      meta = `${fromName} → You (private)`;
    } else {
      meta = `${fromName} (private)`;
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";

  const metaEl = document.createElement("div");
  metaEl.className = "chat-message-meta";
  metaEl.textContent = meta;

  const textEl = document.createElement("div");
  textEl.className = "chat-message-text";
  textEl.textContent = msg.text || "";

  wrapper.appendChild(metaEl);
  wrapper.appendChild(textEl);

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChatUI() {
  chatMessages.innerHTML = "";
  chatTargetSelect.innerHTML = "";
}

function startChatListeners() {
  if (chatListenersStarted || !roomRef || !clientId) return;
  chatListenersStarted = true;

  const chatRoot = roomRef.child("chat");

  // PUBLIC
  chatRoot.child("public").on("child_added", (snap) => {
    const msg = snap.val();
    if (msg) addChatMessageToUI(msg, "public");
  });

  // PRIVATE
  chatRoot.child("private").on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;

    if (msg.fromId === clientId || msg.toId === clientId) {
      addChatMessageToUI(msg, "private");
    }
  });
}

function stopChatListeners() {
  if (!roomRef) return;
  roomRef.child("chat").off();
  chatListenersStarted = false;
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  const target = chatTargetSelect.value;
  const ts = Date.now();

  const chatRoot = roomRef.child("chat");

  if (target === CHAT_TARGET_PUBLIC) {
    chatRoot.child("public").push({
      fromId: clientId,
      fromName: displayName,
      text,
      ts
    });
  } else {
    chatRoot.child("private").push({
      fromId: clientId,
      fromName: displayName,
      toId: target,
      text,
      ts
    });
  }

  chatInput.value = "";
}


// -----------------------------
//  INIT ROOM
// -----------------------------
function initRoomInfra() {
  participantsRef = roomRef.child("participants");

  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;

  myParticipantRef.set({
    name: displayName || clientId,
    lang: userSelectedLanguage,
    joinedAt: Date.now()
  });
  myParticipantRef.onDisconnect().remove();

  participantsRef.on("child_added", snap => {
    const pid = snap.key;
    const pdata = snap.val();
    addParticipantToUI(pid, pdata);

    if (pid !== clientId && clientId > pid) {
      connectToPeer(pid);
    }
  });

  participantsRef.on("child_removed", snap => {
    const pid = snap.key;
    removeParticipantFromUI(pid);
    cleanupPeer(pid);
  });

  roomRef.child("signals").child(clientId).on("child_added", snap => {
    setupSignalHandlersForPeer(snap.key, snap.ref);
  });

  startRoomEmptyWatcher();
  startChatListeners();
}


// -----------------------------
//  CHAT UI TOGGLE
// -----------------------------
function showChatUI() {
  chatPanel.style.display = "flex";
  chatPanel.classList.add("chat-panel--hidden");
  chatPanel.classList.remove("chat-panel--open");

  chatToggleBtn.style.display = "flex";
}

function hideChatUI() {
  chatPanel.style.display = "none";
  chatToggleBtn.style.display = "none";
  clearChatUI();
}


// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  const name = displayNameInput.value.trim();
  if (!name) return alert("Enter your name.");

  displayName = name;

  roomId = generateRoomId();
  roomRef = database.ref(`rooms/${roomId}`);

  await roomRef.set({ createdAt: Date.now() });

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();
  showRoomInfoModal();

  history.replaceState(null, "", `?room=${roomId}`);

  setStatus("room created");
  showChatUI();
}

function showRoomInfoModal() {
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}


// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  const name = displayNameInput.value.trim();
  if (!name) return alert("Enter your name.");

  const snap = await database.ref(`rooms/${id}`).once("value");
  if (!snap.exists()) return alert("Room does not exist.");

  displayName = name;
  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();

  history.replaceState(null, "", `?room=${roomId}`);

  setStatus("joined room");
  showChatUI();
}


// -----------------------------
//  END CALL
// -----------------------------
async function endCall() {
  Object.keys(peers).forEach(pid => cleanupPeer(pid));

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  clearVideos();

  if (myParticipantRef) {
    try { await myParticipantRef.remove(); } catch {}
  }

  stopChatListeners();
  hideChatUI();

  if (roomRef) roomRef.off();

  Object.keys(participantNames).forEach(k => delete participantNames[k]);

  roomRef = null;
  roomId = null;
  clientId = null;
  participantsRef = null;
  myParticipantRef = null;

  updateJoinCodeBadge();

  joinModal.style.display = "flex";
  roomInfoModal.style.display = "none";
  endCallBtn.classList.add("hidden");

  history.replaceState(null, "", window.location.pathname);

  setStatus("idle");
}


// -----------------------------
//  EVENTS
// -----------------------------
startCallBtn.onclick = createRoom;

joinCallBtn.onclick = () => {
  const id = roomIdInput.value.trim();
  if (!id) return alert("Enter a room ID");
  joinRoomById(id);
};

endCallBtn.onclick = endCall;

copyIdBtn.onclick = () => {
  if (!roomId) return;
  navigator.clipboard.writeText(roomId);
  const old = copyIdBtn.textContent;
  copyIdBtn.textContent = "Copied!";
  setTimeout(() => (copyIdBtn.textContent = old), 2000);
};

copyLinkBtn.onclick = () => {
  if (!roomId) return;
  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(url);
  const old = copyLinkBtn.textContent;
  copyLinkBtn.textContent = "Link Copied!";
  setTimeout(() => (copyLinkBtn.textContent = old), 2000);
};

closeRoomInfoBtn.onclick = () => {
  roomInfoModal.style.display = "none";
};

// Mute
muteBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  muteBtn.innerHTML = track.enabled
    ? '<i class="fas fa-microphone"></i><span>Mute</span>'
    : '<i class="fas fa-microphone-slash"></i><span>Unmute</span>';
};

// Video
videoBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  videoBtn.innerHTML = track.enabled
    ? '<i class="fas fa-video"></i><span>Stop Video</span>'
    : '<i class="fas fa-video-slash"></i><span>Start Video</span>';
};

// Chat
chatToggleBtn.onclick = () => {
  const open = chatPanel.classList.contains("chat-panel--open");
  chatPanel.classList.toggle("chat-panel--open", !open);
  chatPanel.classList.toggle("chat-panel--hidden", open);
};

chatCloseBtn.onclick = () => {
  chatPanel.classList.remove("chat-panel--open");
  chatPanel.classList.add("chat-panel--hidden");
};

chatSendBtn.onclick = sendChatMessage;

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage();
  }
});


// -----------------------------
//  AUTO-FILL ROOM FROM URL
// -----------------------------
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom) roomIdInput.value = urlRoom;
});

// -----------------------------
//  CLEANUP ON EXIT
// -----------------------------
window.addEventListener("beforeunload", () => {
  try {
    if (myParticipantRef) myParticipantRef.remove();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  } catch {}
});
