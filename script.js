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

// -----------------------------
//  Status label (debug)
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

function setStatus(text) {
  if (statusLabel) statusLabel.textContent = "Status: " + text;
  console.log("[Status]", text);
}

// -----------------------------
//  STATE
// -----------------------------
let localStream = null;

// Multi‑peer state
let roomRef = null;
let roomId = null;
let peersRef = null;
let offersRef = null;
let answersRef = null;
let iceCandidatesRef = null;

let localPeerId = null;
let hasJoinedSignaling = false;

/**
 * connections[remotePeerId] = {
 *   pc: RTCPeerConnection,
 *   remoteStream: MediaStream,
 *   videoEl: HTMLVideoElement
 * }
 */
const connections = {};

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
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function clearVideos() {
  videoGrid.innerHTML = "";
}

function showRoomInfoModal() {
  if (!roomId) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// Ensure video-grid is multi‑peer friendly (simple grid)
(function setupVideoGridLayout() {
  videoGrid.style.display = "grid";
  videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
  videoGrid.style.gridAutoRows = "minmax(150px, 1fr)";
  videoGrid.style.gap = "6px";
})();

function createLocalVideo(stream) {
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

function createRemoteVideo(remotePeerId) {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.dataset.peerId = remotePeerId;
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "cover";
  videoGrid.appendChild(video);
  return video;
}

function removeRemoteVideo(remotePeerId) {
  const el = videoGrid.querySelector(`video[data-peer-id="${remotePeerId}"]`);
  if (el && el.parentNode) el.parentNode.removeChild(el);
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
    createLocalVideo(localStream);
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
function createPeerConnectionFor(remotePeerId) {
  console.log("[WebRTC] Creating RTCPeerConnection for remote:", remotePeerId);
  const pc = new RTCPeerConnection(configuration);

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    console.log("[WebRTC] iceConnectionState (", remotePeerId, "):", s);
    setStatus("ice(" + remotePeerId + "): " + s);
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connectionState (", remotePeerId, "):", s);
    setStatus("conn(" + remotePeerId + "): " + s);
  };

  pc.ontrack = event => {
    console.log("[WebRTC] Got remote track from", remotePeerId);
    let conn = connections[remotePeerId];
    if (!conn) {
      conn = connections[remotePeerId] = {
        pc,
        remoteStream: new MediaStream(),
        videoEl: createRemoteVideo(remotePeerId)
      };
    }
    if (!conn.remoteStream) {
      conn.remoteStream = new MediaStream();
    }
    event.streams[0].getTracks().forEach(track => {
      conn.remoteStream.addTrack(track);
    });
    conn.videoEl.srcObject = conn.remoteStream;
    const playPromise = conn.videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("[RemoteVideo] play() blocked:", err);
      });
    }
  };

  pc.onicecandidate = event => {
    if (!event.candidate || !roomRef || !localPeerId) return;
    const candidateData = event.candidate.toJSON();
    // send to remote under iceCandidates/<target>/<source>/
    const targetRef = iceCandidatesRef
      .child(remotePeerId)
      .child(localPeerId);
    targetRef.push(candidateData);
    console.log("[ICE] Sent candidate to", remotePeerId);
  };

  return pc;
}

async function makeOfferTo(remotePeerId) {
  let conn = connections[remotePeerId];
  if (!conn) {
    conn = connections[remotePeerId] = {
      pc: createPeerConnectionFor(remotePeerId),
      remoteStream: null,
      videoEl: createRemoteVideo(remotePeerId)
    };
  }
  const pc = conn.pc;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log("[Offer] sending offer to", remotePeerId);

  // offers/<targetPeer>/<fromPeer>
  await offersRef.child(remotePeerId).child(localPeerId).set({
    type: offer.type,
    sdp: offer.sdp
  });
}

function setupSignalingListeners() {
  // Offers addressed TO ME
  const myOffersRef = offersRef.child(localPeerId);
  myOffersRef.on("child_added", async snapshot => {
    const fromPeerId = snapshot.key;
    const offer = snapshot.val();
    console.log("[Offer] got offer from", fromPeerId);

    let conn = connections[fromPeerId];
    if (!conn) {
      conn = connections[fromPeerId] = {
        pc: createPeerConnectionFor(fromPeerId),
        remoteStream: null,
        videoEl: createRemoteVideo(fromPeerId)
      };
    }
    const pc = conn.pc;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // answers/<targetPeer>/<fromPeer>
    await answersRef.child(fromPeerId).child(localPeerId).set({
      type: answer.type,
      sdp: answer.sdp
    });

    console.log("[Answer] sent answer to", fromPeerId);
  });

  // Answers addressed TO ME
  const myAnswersRef = answersRef.child(localPeerId);
  myAnswersRef.on("child_added", async snapshot => {
    const fromPeerId = snapshot.key;
    const answer = snapshot.val();
    console.log("[Answer] got answer from", fromPeerId);
    const conn = connections[fromPeerId];
    if (!conn) {
      console.warn("[Answer] connection for", fromPeerId, "not found");
      return;
    }
    const pc = conn.pc;
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  // ICE candidates addressed TO ME
  const myCandidatesRootRef = iceCandidatesRef.child(localPeerId);
  myCandidatesRootRef.on("child_added", snapshot => {
    const fromPeerId = snapshot.key;
    const fromRef = snapshot.ref; // iceCandidates/<me>/<from>
    fromRef.on("child_added", snap => {
      const candidateData = snap.val();
      const conn = connections[fromPeerId];
      if (!conn) {
        console.warn("[ICE] got candidate for unknown peer", fromPeerId);
        return;
      }
      const pc = conn.pc;
      const candidate = new RTCIceCandidate(candidateData);
      pc.addIceCandidate(candidate).catch(err => {
        console.error("[ICE] error adding candidate from", fromPeerId, err);
      });
    });
  });
}

async function registerPeerInRoom() {
  if (!roomRef) throw new Error("roomRef not set");
  if (hasJoinedSignaling) return;
  hasJoinedSignaling = true;

  peersRef = roomRef.child("peers");
  offersRef = roomRef.child("offers");
  answersRef = roomRef.child("answers");
  iceCandidatesRef = roomRef.child("iceCandidates");

  // register myself
  const newPeerRef = peersRef.push({
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  });
  localPeerId = newPeerRef.key;
  console.log("[Peers] registered as", localPeerId);

  // listen for peers joining
  peersRef.on("child_added", snapshot => {
    const remotePeerId = snapshot.key;
    if (remotePeerId === localPeerId) return;
    console.log("[Peers] detected remote peer", remotePeerId);

    // Order rule so we don't double‑offer:
    // lower peer id initiates
    if (localPeerId < remotePeerId) {
      makeOfferTo(remotePeerId).catch(console.error);
    }
  });

  // Setup signaling listeners for offers/answers/candidates
  setupSignalingListeners();
}

// -----------------------------
//  ROOM FLOW (CREATE / JOIN)
// -----------------------------
async function createRoom() {
  try {
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);
    console.log("[Room] Creating room:", roomId);
    setStatus("creating room " + roomId);

    // create meta so joiners see it exists
    await roomRef.child("meta").set({
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    await startLocalMedia();
    await registerPeerInRoom();

    // UI
    joinModal.style.display = "none";
    endCallBtn.classList.remove("hidden");
    showRoomInfoModal();
    setStatus("room created: " + roomId);
  } catch (err) {
    console.error("[Room] Error creating room:", err);
    setStatus("error creating room");
  }
}

async function joinRoomById(id) {
  if (!id) {
    alert("Please enter a Room ID.");
    return;
  }

  try:
  {
    console.log("[Room] Trying to join room:", id);
    setStatus("joining room " + id);

    roomRef = database.ref(`rooms/${id}`);
    const roomSnapshot = await roomRef.once("value");
    if (!roomSnapshot.exists()) {
      alert("Session does not exist.");
      console.log("[Room] Room not found in DB");
      setStatus("room not found");
      return;
    }

    roomId = id;

    await startLocalMedia();
    await registerPeerInRoom();

    // UI
    joinModal.style.display = "none";
    endCallBtn.classList.remove("hidden");
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
    // Close peer connections
    Object.keys(connections).forEach(peerId => {
      const conn = connections[peerId];
      if (!conn) return;
      if (conn.pc) {
        conn.pc.onicecandidate = null;
        conn.pc.ontrack = null;
        conn.pc.close();
      }
      if (conn.videoEl && conn.videoEl.parentNode) {
        conn.videoEl.parentNode.removeChild(conn.videoEl);
      }
      delete connections[peerId];
    });

    // Stop local media
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    clearVideos();

    // Remove room entirely (host style).
    // If you want rooms to persist when someone leaves, remove this
    // and only remove your own peer entry instead.
    if (roomRef && roomId) {
      try {
        console.log("[Call] Removing room from DB:", roomId);
        await roomRef.remove();
      } catch (err) {
        console.warn("[Call] Error removing room:", err);
      }
    }

    roomRef = null;
    roomId = null;
    localPeerId = null;
    hasJoinedSignaling = false;

    joinModal.style.display = "flex";
    roomInfoModal.style.display = "none";
    endCallBtn.classList.add("hidden");
    roomIdInput.value = "";
    setStatus("idle");
  } catch (err) {
    console.error("[Call] Error ending call:", err);
    setStatus("error ending call");
  }
}

// -----------------------------
//  CHAT UI + LOGIC
// -----------------------------
let chatPanel, chatMessagesEl, chatInputEl, chatSendBtn;
let chatRef = null;

function setupChatUI() {
  if (chatPanel) return;

  chatPanel = document.createElement("div");
  chatPanel.id = "chat-panel";
  chatPanel.style.position = "fixed";
  chatPanel.style.right = "10px";
  chatPanel.style.top = "10px";
  chatPanel.style.width = "260px";
  chatPanel.style.height = "50vh";
  chatPanel.style.background = "rgba(32,33,36,0.95)";
  chatPanel.style.border = "1px solid #3c4043";
  chatPanel.style.borderRadius = "8px";
  chatPanel.style.display = "flex";
  chatPanel.style.flexDirection = "column";
  chatPanel.style.zIndex = "200";
  chatPanel.style.fontSize = "13px";

  const header = document.createElement("div");
  header.textContent = "Chat";
  header.style.padding = "6px 10px";
  header.style.borderBottom = "1px solid #3c4043";
  header.style.fontWeight = "bold";
  chatPanel.appendChild(header);

  chatMessagesEl = document.createElement("div");
  chatMessagesEl.style.flex = "1";
  chatMessagesEl.style.overflowY = "auto";
  chatMessagesEl.style.padding = "6px 10px";
  chatPanel.appendChild(chatMessagesEl);

  const inputRow = document.createElement("div");
  inputRow.style.display = "flex";
  inputRow.style.padding = "6px";
  inputRow.style.borderTop = "1px solid #3c4043";

  chatInputEl = document.createElement("input");
  chatInputEl.type = "text";
  chatInputEl.placeholder = "Type message…";
  chatInputEl.style.flex = "1";
  chatInputEl.style.background = "#202124";
  chatInputEl.style.border = "1px solid #5f6368";
  chatInputEl.style.color = "#dadce0";
  chatInputEl.style.borderRadius = "4px";
  chatInputEl.style.fontSize = "13px";
  chatInputEl.style.padding = "4px 6px";

  chatSendBtn = document.createElement("button");
  chatSendBtn.textContent = "Send";
  chatSendBtn.style.marginLeft = "4px";
  chatSendBtn.style.background = "#1a73e8";
  chatSendBtn.style.border = "none";
  chatSendBtn.style.color = "white";
  chatSendBtn.style.padding = "4px 10px";
  chatSendBtn.style.borderRadius = "4px";
  chatSendBtn.style.cursor = "pointer";

  inputRow.appendChild(chatInputEl);
  inputRow.appendChild(chatSendBtn);
  chatPanel.appendChild(inputRow);

  document.body.appendChild(chatPanel);

  chatSendBtn.addEventListener("click", sendChatMessage);
  chatInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
  });
}

function appendChatMessage({ from, text, translatedText, lang, ts, kind }) {
  if (!chatMessagesEl) return;
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "4px";

  const meta = document.createElement("div");
  meta.style.color = "#9aa0a6";
  meta.style.fontSize = "11px";
  meta.textContent =
    (kind === "caption" ? "[Caption] " : "") +
    (from === localPeerId ? "You" : from) +
    (lang ? ` (${lang})` : "");
  wrap.appendChild(meta);

  const body = document.createElement("div");
  body.style.color = "#e8eaed";
  body.textContent = text;
  wrap.appendChild(body);

  if (translatedText && translatedText !== text) {
    const t = document.createElement("div");
    t.style.color = "#8ab4f8";
    t.style.fontSize = "12px";
    t.textContent = translatedText;
    wrap.appendChild(t);
  }

  chatMessagesEl.appendChild(wrap);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function initChat() {
  if (!roomRef) return;
  setupChatUI();
  chatRef = roomRef.child("chat");
  chatRef.off();
  chatRef.on("child_added", snapshot => {
    const msg = snapshot.val();
    appendChatMessage(msg);
  });
}

function sendChatMessage() {
  if (!chatRef || !chatInputEl) return;
  const text = chatInputEl.value.trim();
  if (!text) return;
  chatInputEl.value = "";

  chatRef.push({
    from: localPeerId || "unknown",
    text,
    translatedText: null,
    lang: null,
    kind: "chat",
    ts: Date.now()
  });
}

// -----------------------------
//  SPEECH RECOGNITION + TRANSLATOR
// -----------------------------
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recognition = null;
let captionActive = false;
let captionBtn = null;
let languageSelect = null;

function setupTranslatorUI() {
  if (captionBtn) return;

  const bar = document.createElement("div");
  bar.id = "translator-bar";
  bar.style.position = "fixed";
  bar.style.left = "10px";
  bar.style.top = "10px";
  bar.style.zIndex = "200";
  bar.style.display = "flex";
  bar.style.alignItems = "center";
  bar.style.gap = "6px";
  bar.style.background = "rgba(32,33,36,0.95)";
  bar.style.border = "1px solid #3c4043";
  bar.style.borderRadius = "8px";
  bar.style.padding = "4px 8px";
  bar.style.fontSize = "12px";
  bar.style.color = "#dadce0";

  const label = document.createElement("span");
  label.textContent = "Translate to:";
  bar.appendChild(label);

  languageSelect = document.createElement("select");
  [
    ["en", "English"],
    ["es", "Spanish"],
    ["fr", "French"],
    ["de", "German"],
    ["ru", "Russian"],
    ["zh", "Chinese"],
    ["ja", "Japanese"],
    ["ko", "Korean"]
  ].forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    languageSelect.appendChild(opt);
  });
  languageSelect.value = "en";
  bar.appendChild(languageSelect);

  captionBtn = document.createElement("button");
  captionBtn.textContent = "🎤 Auto‑translate OFF";
  captionBtn.style.background = "#3c4043";
  captionBtn.style.border = "none";
  captionBtn.style.color = "#dadce0";
  captionBtn.style.borderRadius = "4px";
  captionBtn.style.cursor = "pointer";
  captionBtn.style.padding = "4px 6px";
  bar.appendChild(captionBtn);

  document.body.appendChild(bar);

  captionBtn.addEventListener("click", toggleCaptions);
}

function initSpeechRecognition() {
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not supported in this browser");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "auto"; // change to your own language if desired
  recognition.interimResults = false;
  recognition.continuous = true;

  recognition.onresult = async event => {
    const last = event.results[event.results.length - 1];
    if (!last || !last.isFinal) return;
    const text = last[0].transcript.trim();
    if (!text) return;

    const targetLang = languageSelect ? languageSelect.value : "en";
    let translatedText = text;
    try {
      translatedText = await translateText(text, targetLang);
    } catch (e) {
      console.warn("Translation failed, using original text");
    }

    if (!chatRef) return;
    chatRef.push({
      from: localPeerId || "unknown",
      text,
      translatedText,
      lang: targetLang,
      kind: "caption",
      ts: Date.now()
    });
  };

  recognition.onerror = e => {
    console.warn("Speech recognition error:", e);
    if (captionActive) {
      // try to restart lightly
      try {
        recognition.stop();
        recognition.start();
      } catch (err) {
        console.warn("Failed to restart recognition:", err);
      }
    }
  };
}

async function translateText(text, targetLang) {
  // 🔧 Replace with your own translation backend or API.
  // Example: POST /translate { text, targetLang } which returns { translatedText }
  // For now, just echo text so it doesn't break.
  try {
    const res = await fetch("/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data.translatedText || text;
  } catch (e) {
    console.warn("translateText fallback:", e);
    return text;
  }
}

function toggleCaptions() {
  if (!recognition) {
    alert(
      "Auto‑translate captions are not supported in this browser.\nTry Chrome or Edge desktop."
    );
    return;
  }
  captionActive = !captionActive;
  if (captionActive) {
    try {
      recognition.start();
      captionBtn.textContent = "🎤 Auto‑translate ON";
      captionBtn.style.background = "#1a73e8";
    } catch (e) {
      console.warn("Failed to start recognition:", e);
      captionActive = false;
    }
  } else {
    recognition.stop();
    captionBtn.textContent = "🎤 Auto‑translate OFF";
    captionBtn.style.background = "#3c4043";
  }
}

// -----------------------------
//  BUTTON EVENTS
// -----------------------------
startCallBtn.addEventListener("click", () => {
  createRoom().catch(console.error);
});

joinCallBtn.addEventListener("click", () => {
  const inputRoomId = roomIdInput.value.trim();
  joinRoomById(inputRoomId).catch(console.error);
});

endCallBtn.addEventListener("click", () => {
  endCall();
});

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

closeRoomInfoBtn.addEventListener("click", () => {
  roomInfoModal.style.display = "none";
});

// Mute / Unmute
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

// Toggle Video
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

// Cleanup when leaving page
window.addEventListener("beforeunload", () => {
  try {
    Object.values(connections).forEach(conn => {
      if (conn.pc) conn.pc.close();
    });
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (roomRef && roomId) {
      // optional: remove only my peer entry instead
      roomRef.remove();
    }
  } catch (e) {
    console.warn(e);
  }
});

// Auto-join if ?room=ID in URL
window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomId = urlParams.get("room");

  // Setup chat & translator UI right away
  setupChatUI();
  setupTranslatorUI();
  initSpeechRecognition();

  if (urlRoomId) {
    roomIdInput.value = urlRoomId;
    joinRoomById(urlRoomId).catch(console.error);
  }
});
