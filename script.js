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

// NEW: optional device selector buttons (add them in HTML if you want to use)
const selectMicBtn = document.getElementById("select-mic-btn");
const selectCamBtn = document.getElementById("select-cam-btn");

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

// Join code bubble (always shows latest room ID)
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
let clientId = null;            // this client's unique id inside the room
let participantsRef = null;     // rooms/{roomId}/participants
let myParticipantRef = null;    // rooms/{roomId}/participants/{clientId}
// peerId -> { pc, remoteStream, videoEl }
const peers = {};

// language preference for translations (default english)
let userSelectedLanguage = "en";
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", (e) => {
    userSelectedLanguage = e.target.value || "en";
  });
}

// Auto-delete timer (no participants for 10 minutes)
let inactivityTimer = null;

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
  return Math.random().toString(36).substring(2, 8); // lowercase code
}

function clearVideos() {
  if (videoGrid) videoGrid.innerHTML = "";
}

// Update join-code bubble text
function updateJoinCodeBadge() {
  if (!joinCodeBadge) return;
  if (roomId) {
    joinCodeBadge.textContent = `CODE: ${roomId}`;
  } else {
    joinCodeBadge.textContent = "CODE: ----";
  }
}

// 1‑on‑1 fullscreen vs multi‑grid layout
function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => v.classList.remove("fullscreen-remote"));
  if (remoteVideos.length === 1) {
    remoteVideos[0].classList.add("fullscreen-remote");
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
  // adjust fullscreen vs multi layout
  updateVideoLayout();
}

function showRoomInfoModal() {
  if (!roomId || !roomInfoModal || !roomIdDisplay) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// -----------------------------
//  MEDIA
// -----------------------------
// (kept for compatibility, but NOT auto-called on join/create anymore)
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
    // attach to existing peers if any
    attachLocalTracksToAllPeers();
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
    pc,
    remoteStream,
    videoEl: peers[peerId]?.videoEl || null
  };

  // Add local tracks if we already have media
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

  // ICE candidates -> Firebase signaling
  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    console.log("[WebRTC] ICE candidate for", peerId);
    signalsRef.child("ice").push(event.candidate.toJSON());
  };

  return pc;
}

// initial connect (first offer)
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

// renegotiate when we add new local tracks later
async function renegotiateWithPeer(peerId) {
  try {
    const peer = peers[peerId];
    if (!peer || !peer.pc || !roomRef || !clientId) return;
    const pc = peer.pc;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    await signalsRef.child("offer").set({
      type: offer.type,
      sdp: offer.sdp
    });
    console.log("[WebRTC] Renegotiation offer sent to", peerId);
  } catch (err) {
    console.error("[WebRTC] Error renegotiating with peer", peerId, err);
  }
}

// Attach local tracks to all existing peers and renegotiate
function attachLocalTracksToAllPeers() {
  if (!localStream) return;

  Object.keys(peers).forEach((pid) => {
    const peer = peers[pid];
    if (!peer || !peer.pc) return;
    const pc = peer.pc;

    const senders = pc.getSenders ? pc.getSenders() : [];
    localStream.getTracks().forEach((track) => {
      const already = senders.find(
        (s) => s.track && s.track.kind === track.kind
      );
      if (!already) {
        pc.addTrack(track, localStream);
      }
    });

    // renegotiate so others start receiving the new track(s)
    renegotiateWithPeer(pid);
  });
}

// Handle incoming offers/answers/ICE for a given peer
function setupSignalHandlersForPeer(fromId, fromRef) {
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
  // recalc layout after someone leaves
  updateVideoLayout();
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
    // Translate each message into user's selected language
    const translated = await translateText(msg.text, userSelectedLanguage);
    addChatMessageToUI({
      sender: msg.sender,
      text: translated
    });
    // Optionally also show as subtitles (for simple "spoken text -> translated")
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
//  ROOM INACTIVITY WATCHER
//  (auto delete if no participants for 10 minutes)
// -----------------------------
function setupInactivityWatcher() {
  if (!roomRef) return;
  const participantsNode = roomRef.child("participants");

  participantsNode.on("value", (snap) => {
    const val = snap.val();
    const hasParticipants = val && Object.keys(val).length > 0;

    if (!hasParticipants) {
      if (!inactivityTimer) {
        console.log("[Room] No participants, scheduling auto-delete in 10 minutes");
        inactivityTimer = setTimeout(async () => {
          try {
            await roomRef.remove();
            console.log("[Room] Auto-deleted empty room:", roomId);
          } catch (err) {
            console.warn("[Room] Failed to auto-delete room:", err);
          }
        }, 10 * 60 * 1000); // 10 minutes
      }
    } else {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
        console.log("[Room] Participants present, auto-delete timer cleared");
      }
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

  // Listen for participants join/leave
  participantsRef.on("child_added", (snap) => {
    const pid = snap.key;
    if (!pid) return;
    addParticipantToUI(pid);
    if (pid === clientId) return;
    // Only one side should initiate connection -> use simple lexicographic rule
    if (clientId > pid) {
      // We are "later" -> we initiate offer
      connectToPeer(pid);
    }
  });

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

  // Auto-delete watcher
  setupInactivityWatcher();
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

    // IMPORTANT: do NOT auto-start media here (no permission required to create)
    // await startLocalMedia();

    initRoomInfra();

    // UI
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    showRoomInfoModal();
    updateJoinCodeBadge();

    // Update URL to include ?room=ID
    if (window.history && window.history.replaceState) {
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      window.history.replaceState(null, "", newUrl);
    }

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

    // DO NOT auto-start media here -> join without permissions
    // await startLocalMedia();

    initRoomInfra();

    // UI
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    updateJoinCodeBadge();

    // Update URL to match this room
    if (window.history && window.history.replaceState) {
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      window.history.replaceState(null, "", newUrl);
    }

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
    // Close all peer connections
    Object.keys(peers).forEach((pid) => cleanupPeer(pid));

    // Local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    clearVideos();

    // Remove our participant
    if (myParticipantRef) {
      try {
        await myParticipantRef.remove();
      } catch (e) {
        console.warn("[Call] Error removing participant:", e);
      }
      myParticipantRef = null;
    }

    // We do NOT remove the entire room here; auto-delete watcher handles it
    roomRef = null;
    roomId = null;
    clientId = null;
    updateJoinCodeBadge();

    if (joinModal) joinModal.style.display = "flex";
    if (roomInfoModal) roomInfoModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.add("hidden");
    if (roomIdInput) roomIdInput.value = "";

    // Reset URL back to base (no ?room=)
    if (window.history && window.history.replaceState) {
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState(null, "", baseUrl);
    }

    setStatus("idle");
  } catch (err) {
    console.error("[Call] Error ending call:", err);
    setStatus("error ending call");
  }
}

// -----------------------------
//  DEVICE ENUMERATION + SELECT
// -----------------------------
async function listDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    alert("Media devices API not supported in this browser.");
    throw new Error("enumerateDevices not supported");
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    mics: devices.filter((d) => d.kind === "audioinput"),
    cams: devices.filter((d) => d.kind === "videoinput")
  };
}

// Replace audio or video tracks in localStream while keeping the other kind
function replaceTracksInLocalStream(kind, newTracks) {
  if (!localStream) {
    localStream = new MediaStream();
  }

  // Remove existing tracks of this kind
  const oldTracks =
    kind === "audio"
      ? localStream.getAudioTracks()
      : localStream.getVideoTracks();

  oldTracks.forEach((t) => {
    t.stop();
    localStream.removeTrack(t);
  });

  // Add new tracks
  newTracks.forEach((t) => {
    localStream.addTrack(t);
  });

  // Update local preview
  addLocalVideo(localStream);

  // Attach to peers and renegotiate
  attachLocalTracksToAllPeers();
}

// Select Microphone
if (selectMicBtn && navigator.mediaDevices) {
  selectMicBtn.addEventListener("click", async () => {
    try {
      setStatus("selecting microphone");
      const { mics } = await listDevices();
      if (mics.length === 0) {
        alert("No microphones detected.");
        return;
      }

      const choice = prompt(
        "Select a microphone by number:\n\n" +
          mics.map((m, i) => `${i + 1}. ${m.label || "Mic " + (i + 1)}`).join("\n")
      );
      if (!choice) return;

      const index = parseInt(choice, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= mics.length) {
        return;
      }

      const deviceId = mics[index].deviceId;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      });

      const newAudioTracks = stream.getAudioTracks();
      if (newAudioTracks.length === 0) {
        alert("Selected microphone has no audio track.");
        return;
      }

      replaceTracksInLocalStream("audio", newAudioTracks);
      setStatus("microphone selected");
    } catch (err) {
      console.error("[Devices] Error selecting microphone:", err);
      alert("Could not access the selected microphone.");
      setStatus("mic select error");
    }
  });
}

// Select Camera
if (selectCamBtn && navigator.mediaDevices) {
  selectCamBtn.addEventListener("click", async () => {
    try {
      setStatus("selecting camera");
      const { cams } = await listDevices();
      if (cams.length === 0) {
        alert("No cameras detected.");
        return;
      }

      const choice = prompt(
        "Select a camera by number:\n\n" +
          cams.map((c, i) => `${i + 1}. ${c.label || "Camera " + (i + 1)}`).join("\n")
      );
      if (!choice) return;

      const index = parseInt(choice, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= cams.length) {
        return;
      }

      const deviceId = cams[index].deviceId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });

      const newVideoTracks = stream.getVideoTracks();
      if (newVideoTracks.length === 0) {
        alert("Selected camera has no video track.");
        return;
      }

      replaceTracksInLocalStream("video", newVideoTracks);
      setStatus("camera selected");
    } catch (err) {
      console.error("[Devices] Error selecting camera:", err);
      alert("Could not access the selected camera.");
      setStatus("camera select error");
    }
  });
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
    const roomUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
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
