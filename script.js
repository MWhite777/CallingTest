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
  appId: "1:222289306242:web:8963a4ea7ce852c2324a9b",
  measurementId: "G-BC52VQ658F"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log("[Firebase] Initialized");

// -----------------------------
//  TRANSLATIONS (EN / RU)
// -----------------------------
const translations = {
  en: {
    joinTitle: "Join or Start a Call",
    namePlaceholder: "Enter your name",
    roomPlaceholder: "Enter Room ID to join",
    joinCall: "Join Call",
    startCall: "Start New Call",
    chatHeader: "Chat",
    chatTo: "To:",
    chatPlaceholder: "Type a message...",
    mute: "Mute",
    unmute: "Unmute",
    stopVideo: "Stop Video",
    startVideo: "Start Video"
  },
  ru: {
    joinTitle: "Присоединиться или создать звонок",
    namePlaceholder: "Введите ваше имя",
    roomPlaceholder: "Введите ID комнаты",
    joinCall: "Присоединиться",
    startCall: "Создать комнату",
    chatHeader: "Чат",
    chatTo: "Кому:",
    chatPlaceholder: "Напишите сообщение...",
    mute: "Выключить микрофон",
    unmute: "Включить микрофон",
    stopVideo: "Выключить видео",
    startVideo: "Включить видео"
  }
};

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

// Chat panel elements
const chatPanel = document.getElementById("chat-panel");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatTargetSelect = document.getElementById("chat-target-select");

// Optional future UI
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

// Join code badge
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
// display name for this client
let displayName = "";
// map clientId -> name for chat / UI
const participantNames = {};
// chat state
const CHAT_TARGET_PUBLIC = "__public__";
let chatListenersStarted = false;

// -----------------------------
//  LANGUAGE HELPER
// -----------------------------
function applyLanguage(lang) {
  const t = translations[lang] || translations.en;
  userSelectedLanguage = lang;

  // Join modal texts
  const joinTitleEl = joinModal ? joinModal.querySelector("h2") : null;
  if (joinTitleEl) joinTitleEl.textContent = t.joinTitle;
  if (displayNameInput) displayNameInput.placeholder = t.namePlaceholder;
  if (roomIdInput) roomIdInput.placeholder = t.roomPlaceholder;
  if (joinCallBtn) joinCallBtn.textContent = t.joinCall;
  if (startCallBtn) startCallBtn.textContent = t.startCall;

  // Chat UI
  const chatHeaderSpan = chatPanel ? chatPanel.querySelector(".chat-panel__header span") : null;
  if (chatHeaderSpan) chatHeaderSpan.textContent = t.chatHeader;
  const chatTargetLabel = chatPanel ? chatPanel.querySelector(".chat-panel__target label") : null;
  if (chatTargetLabel) chatTargetLabel.textContent = t.chatTo;
  if (chatInput) chatInput.placeholder = t.chatPlaceholder;

  // Control buttons text based on current track state
  const audioTrack = localStream && localStream.getAudioTracks()[0];
  const videoTrack = localStream && localStream.getVideoTracks()[0];
  if (muteBtn) {
    const enabled = audioTrack ? audioTrack.enabled : true;
    muteBtn.innerHTML = enabled
      ? `<i class="fas fa-microphone"></i><span>${t.mute}</span>`
      : `<i class="fas fa-microphone-slash"></i><span>${t.unmute}</span>`;
  }
  if (videoBtn) {
    const enabled = videoTrack ? videoTrack.enabled : true;
    videoBtn.innerHTML = enabled
      ? `<i class="fas fa-video"></i><span>${t.stopVideo}</span>`
      : `<i class="fas fa-video-slash"></i><span>${t.startVideo}</span>`;
  }
}

// Init language selector
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  applyLanguage(userSelectedLanguage);
  languageSelect.addEventListener("change", (e) => {
    const lang = e.target.value || "en";
    applyLanguage(lang);
  });
} else {
  applyLanguage(userSelectedLanguage);
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

function updateJoinCodeBadge() {
  if (!joinCodeBadge) return;
  joinCodeBadge.textContent = roomId ? `CODE: ${roomId}` : "CODE: ----";
}

// AUTO LAYOUT DETECTION:
// 1 remote   -> fullscreen
// 2 remotes  -> 2 columns
// 3+ remotes -> 3 columns-ish grid
function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  const count = remoteVideos.length;

  remoteVideos.forEach(v => {
    v.classList.remove("fullscreen-remote");
    v.style.flex = "";
    v.style.maxWidth = "";
  });

  if (count === 1) {
    remoteVideos[0].classList.add("fullscreen-remote");
  } else if (count === 2) {
    remoteVideos.forEach(v => {
      v.style.flex = "1 1 calc(50% - 20px)";
      v.style.maxWidth = "calc(50% - 20px)";
    });
  } else if (count >= 3) {
    remoteVideos.forEach(v => {
      v.style.flex = "1 1 calc(33.33% - 20px)";
      v.style.maxWidth = "calc(33.33% - 20px)";
    });
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
  } else {
    v.classList.add("remote-video");
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
    peer.videoEl = v;
  }
  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(err => console.warn("play blocked", err));
  updateVideoLayout();
}

function showRoomInfoModal() {
  if (!roomIdDisplay || !roomInfoModal) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
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
    // Refresh button labels now that we have actual tracks
    applyLanguage(userSelectedLanguage);
    return localStream;
  } catch (err) {
    console.error(err);
    alert("Could not access camera/microphone.");
    throw err;
  }
}

// -----------------------------
//  WEBRTC
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
    if (!event.candidate || !roomRef || !clientId) return;
    roomRef.child("signals").child(peerId).child(clientId)
      .child("ice").push(event.candidate.toJSON());
  };

  return pc;
}

async function connectToPeer(peerId) {
  const pc = createPeerConnectionForPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  roomRef.child("signals").child(peerId).child(clientId)
    .child("offer").set({ type: offer.type, sdp: offer.sdp });
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
      roomRef.child("signals").child(fromId).child(clientId)
        .child("answer").set({ type: answer.type, sdp: answer.sdp });
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
//  PARTICIPANTS + PRIVATE CHAT TARGETS
// -----------------------------
function rebuildChatTargetSelect() {
  if (!chatTargetSelect) return;
  chatTargetSelect.innerHTML = "";

  // Everyone (public)
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
  if (li && participantsList) li.remove();
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
//  ROOM AUTO‑DELETE AFTER EMPTY FOR 10 MIN
//  (runs while at least one client with this page open is watching)
// -----------------------------
function startRoomEmptyWatcher() {
  if (!roomRef || !participantsRef) return;

  const EMPTY_TIMEOUT = 10 * 60 * 1000; // 10 min
  let emptyTimeoutId = null;

  participantsRef.on("value", async (snap) => {
    const participants = snap.val();
    const count = participants ? Object.keys(participants).length : 0;

    if (count === 0) {
      // schedule cleanup if not already scheduled
      if (!emptyTimeoutId) {
        console.log("[Cleanup] Room is empty, starting 10‑minute timer...");
        emptyTimeoutId = setTimeout(async () => {
          try {
            const againSnap = await participantsRef.once("value");
            const againParticipants = againSnap.val();
            const againCount = againParticipants ? Object.keys(againParticipants).length : 0;
            if (againCount === 0) {
              console.log("[Cleanup] Room still empty after 10 minutes. Removing room and chats...");
              roomRef.remove();
            } else {
              console.log("[Cleanup] Room not empty anymore, aborting delete.");
            }
          } catch (e) {
            console.warn("[Cleanup] Error while removing room:", e);
          } finally {
            emptyTimeoutId = null;
          }
        }, EMPTY_TIMEOUT);
      }
    } else {
      // room not empty → cancel any pending timeout
      if (emptyTimeoutId) {
        console.log("[Cleanup] Room no longer empty, cancelling delete timer.");
        clearTimeout(emptyTimeoutId);
        emptyTimeoutId = null;
      }
    }
  });
}

// -----------------------------
//  CHAT: PUBLIC + PRIVATE
// -----------------------------
function addChatMessageToUI(msg, scope) {
  if (!chatMessages) return;
  const fromId = msg.fromId || "unknown";
  const fromName = msg.fromName || participantNames[fromId] || fromId;
  const toId = msg.toId || null;

  let meta = "";
  if (scope === "public") {
    meta = `${fromName} → Everyone`;
  } else {
    // private
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
  if (chatMessages) chatMessages.innerHTML = "";
  if (chatTargetSelect) {
    chatTargetSelect.innerHTML = "";
  }
}

// start listeners for current room
function startChatListeners() {
  if (chatListenersStarted || !roomRef || !clientId) return;
  chatListenersStarted = true;

  const chatRoot = roomRef.child("chat");

  // PUBLIC
  const publicRef = chatRoot.child("public");
  publicRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    addChatMessageToUI(msg, "public");
  });

  // PRIVATE (single feed, filter for this client)
  const privateRef = chatRoot.child("private");
  privateRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    const { fromId, toId } = msg;
    if (!fromId || !toId) return;
    if (fromId === clientId || toId === clientId) {
      addChatMessageToUI(msg, "private");
    }
  });

  console.log("[Chat] listeners attached for room", roomId);
}

function stopChatListeners() {
  if (!roomRef) return;
  roomRef.child("chat").off();
  chatListenersStarted = false;
}

function sendChatMessage() {
  if (!roomRef || !clientId || !displayName) {
    alert("You must be in a room to chat.");
    return;
  }
  const text = chatInput.value.trim();
  if (!text) return;

  const target = chatTargetSelect ? chatTargetSelect.value : CHAT_TARGET_PUBLIC;
  const chatRoot = roomRef.child("chat");
  const ts = Date.now();

  if (target === CHAT_TARGET_PUBLIC) {
    const msg = {
      fromId: clientId,
      fromName: displayName,
      text,
      ts
    };
    chatRoot.child("public").push(msg);
  } else {
    const toId = target;
    const msg = {
      fromId: clientId,
      fromName: displayName,
      toId,
      text,
      ts
    };
    chatRoot.child("private").push(msg);
  }

  chatInput.value = "";
}

// -----------------------------
//  INIT ROOM
// -----------------------------
function initRoomInfra() {
  if (!roomRef) return;

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
    const pdata = snap.val() || {};
    addParticipantToUI(pid, pdata);
    if (pid !== clientId && clientId > pid) connectToPeer(pid);
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
//  SHOW/HIDE CHAT UI BY CALL STATE
// -----------------------------
function showChatUI() {
  if (chatPanel) {
    chatPanel.style.display = "flex";
    chatPanel.classList.add("chat-panel--hidden");
    chatPanel.classList.remove("chat-panel--open");
  }
  if (chatToggleBtn) {
    chatToggleBtn.style.display = "flex";
  }
}

function hideChatUI() {
  if (chatPanel) {
    chatPanel.style.display = "none";
    chatPanel.classList.add("chat-panel--hidden");
    chatPanel.classList.remove("chat-panel--open");
  }
  if (chatToggleBtn) {
    chatToggleBtn.style.display = "none";
  }
  clearChatUI();
}

// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  const name = displayNameInput ? displayNameInput.value.trim() : "";
  if (!name) {
    alert("Please enter your name first.");
    return;
  }
  displayName = name;

  roomId = generateRoomId();
  roomRef = database.ref(`rooms/${roomId}`);
  await roomRef.set({ createdAt: Date.now() });

  await startLocalMedia();
  initRoomInfra();

  if (joinModal) joinModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();
  showRoomInfoModal();
  history.replaceState(null, "", `?room=${roomId}`);
  setStatus("room created");
  showChatUI();
}

// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  const name = displayNameInput ? displayNameInput.value.trim() : "";
  if (!name) {
    alert("Please enter your name first.");
    return;
  }
  displayName = name;

  const snap = await database.ref(`rooms/${id}`).once("value");
  if (!snap.exists()) {
    alert("Room does not exist.");
    return;
  }

  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);

  await startLocalMedia();
  initRoomInfra();

  if (joinModal) joinModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();
  history.replaceState(null, "", `?room=${roomId}`);
  setStatus("joined room");
  showChatUI();
}

// -----------------------------
//  END CALL
// -----------------------------
async function endCall() {
  console.log("[Call] Ending call");

  Object.keys(peers).forEach(pid => cleanupPeer(pid));

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  clearVideos();

  if (myParticipantRef) {
    try {
      await myParticipantRef.remove();
    } catch (e) {
      console.warn(e);
    }
  }

  stopChatListeners();
  hideChatUI();

  if (roomRef) {
    roomRef.off();
  }

  // reset participantNames
  Object.keys(participantNames).forEach(k => delete participantNames[k]);

  roomRef = null;
  roomId = null;
  clientId = null;
  participantsRef = null;
  myParticipantRef = null;

  updateJoinCodeBadge();

  if (joinModal) joinModal.style.display = "flex";
  if (roomInfoModal) roomInfoModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.add("hidden");

  // Reset URL back to base path (no room)
  history.replaceState(null, "", window.location.pathname);
  setStatus("idle");
}

// -----------------------------
//  EVENTS
// -----------------------------
if (startCallBtn) {
  startCallBtn.onclick = createRoom;
}

if (joinCallBtn) {
  joinCallBtn.onclick = () => {
    const id = roomIdInput ? roomIdInput.value.trim() : "";
    if (!id) {
      alert("Enter a Room ID.");
      return;
    }
    joinRoomById(id);
  };
}

if (endCallBtn) {
  endCallBtn.onclick = endCall;
}

if (copyIdBtn) {
  copyIdBtn.onclick = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    const old = copyIdBtn.textContent;
    copyIdBtn.textContent = "Copied!";
    setTimeout(() => (copyIdBtn.textContent = old), 2000);
  };
}

if (copyLinkBtn) {
  copyLinkBtn.onclick = () => {
    if (!roomId) return;
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    const old = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "Link Copied!";
    setTimeout(() => (copyLinkBtn.textContent = old), 2000);
  };
}

if (closeRoomInfoBtn) {
  closeRoomInfoBtn.onclick = () => {
    if (roomInfoModal) roomInfoModal.style.display = "none";
  };
}

// Mute
if (muteBtn) {
  muteBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const t = translations[userSelectedLanguage] || translations.en;
    muteBtn.innerHTML = track.enabled
      ? `<i class="fas fa-microphone"></i><span>${t.mute}</span>`
      : `<i class="fas fa-microphone-slash"></i><span>${t.unmute}</span>`;
  };
}

// Video
if (videoBtn) {
  videoBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const t = translations[userSelectedLanguage] || translations.en;
    videoBtn.innerHTML = track.enabled
      ? `<i class="fas fa-video"></i><span>${t.stopVideo}</span>`
      : `<i class="fas fa-video-slash"></i><span>${t.startVideo}</span>`;
  };
}

// Chat UI events
if (chatToggleBtn && chatPanel) {
  chatToggleBtn.addEventListener("click", () => {
    const open = chatPanel.classList.contains("chat-panel--open");
    if (open) {
      chatPanel.classList.remove("chat-panel--open");
      chatPanel.classList.add("chat-panel--hidden");
    } else {
      chatPanel.classList.remove("chat-panel--hidden");
      chatPanel.classList.add("chat-panel--open");
    }
  });
}

if (chatCloseBtn && chatPanel) {
  chatCloseBtn.addEventListener("click", () => {
    chatPanel.classList.remove("chat-panel--open");
    chatPanel.classList.add("chat-panel--hidden");
  });
}

if (chatSendBtn && chatInput) {
  chatSendBtn.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// -----------------------------
//  AUTO-JOIN PRE-FILL FROM URL
// -----------------------------
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom && roomIdInput) {
    roomIdInput.value = urlRoom;
  }
  // joinModal stays open: user must still enter name + click
});

// Cleanup on tab close
window.addEventListener("beforeunload", () => {
  try {
    if (myParticipantRef) myParticipantRef.remove();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  } catch {}
});
