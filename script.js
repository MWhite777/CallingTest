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

// A small status label so you can see connection state without DevTools
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

// -----------------------------
//  STATE
// -----------------------------
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let roomRef = null;
let roomId = null;
let isCaller = false;

// -----------------------------
//  ICE SERVERS (STUN + your TURN)
// -----------------------------
const configuration = {
  iceServers: [
    // Public STUN
    { urls: "stun:stun.l.google.com:19302" },

    // Your ExpressTurn relay
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

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) {
    video = document.createElement("video");
    video.id = "video-local";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // avoid echo
    video.classList.add("local-video");
    videoGrid.appendChild(video);
  }
  video.srcObject = stream;
}

function addRemoteVideo(stream) {
  let video = document.getElementById("video-remote");
  if (!video) {
    video = document.createElement("video");
    video.id = "video-remote";
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    videoGrid.appendChild(video);
  }
  video.srcObject = stream;
  // Try to force playback (helps with some autoplay policies)
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(err => {
      console.warn("[RemoteVideo] play() was blocked:", err);
    });
  }
}

function clearVideos() {
  videoGrid.innerHTML = "";
}

function showRoomInfoModal() {
  if (!roomId) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// -----------------------------
//  MEDIA + PEER CONNECTION
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

function createPeerConnection() {
  console.log("[WebRTC] Creating RTCPeerConnection");
  setStatus("creating peer");
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.oniceconnectionstatechange = () => {
    const s = peerConnection.iceConnectionState;
    console.log("[WebRTC] iceConnectionState:", s);
    setStatus("ice: " + s);
  };

  peerConnection.onconnectionstatechange = () => {
    const s = peerConnection.connectionState;
    console.log("[WebRTC] connectionState:", s);
    setStatus("conn: " + s);
  };

  // Add local tracks before creating offer/answer
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Remote tracks
  peerConnection.ontrack = event => {
    console.log("[WebRTC] Got remote track");
    if (!remoteStream) {
      remoteStream = new MediaStream();
      addRemoteVideo(remoteStream);
    }
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  // ICE candidates -> Firebase
  peerConnection.onicecandidate = event => {
    if (!event.candidate || !roomRef) return;

    const candidatesRef = isCaller
      ? roomRef.child("callerCandidates")
      : roomRef.child("calleeCandidates");

    console.log("[WebRTC] New ICE candidate, saving to DB");
    candidatesRef.push(event.candidate.toJSON());
  };
}

// -----------------------------
//  CALL FLOW - CREATE ROOM
// -----------------------------
async function createRoom() {
  try {
    isCaller = true;
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);
    console.log("[Room] Creating room:", roomId);
    setStatus("creating room " + roomId);

    await startLocalMedia();
    createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("[Room] Created offer, saving to DB");

    await roomRef.set({
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    });

    // Listen for answer
    roomRef.child("answer").on("value", async snapshot => {
      const answer = snapshot.val();
      if (!answer) return;
      if (peerConnection.currentRemoteDescription) return;
      console.log("[Room] Got answer from DB, setting remote description");
      const rtcAnswer = new RTCSessionDescription(answer);
      await peerConnection.setRemoteDescription(rtcAnswer);
    });

    // Listen for callee ICE candidates
    roomRef.child("calleeCandidates").on("child_added", snapshot => {
      const data = snapshot.val();
      if (!data) return;
      console.log("[Room] Got callee ICE candidate from DB");
      const candidate = new RTCIceCandidate(data);
      peerConnection.addIceCandidate(candidate).catch(console.error);
    });

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

    isCaller = false;
    roomId = id;
    roomRef = database.ref(`rooms/${roomId}`);

    await startLocalMedia();
    createPeerConnection();

    const roomData = roomSnapshot.val();
    const offer = roomData.offer;
    if (!offer) {
      alert("This room has no active offer.");
      console.log("[Room] Offer missing in DB");
      setStatus("no offer in room");
      return;
    }

    console.log("[Room] Got offer from DB, setting remote description");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log("[Room] Created answer, saving to DB");

    await roomRef.child("answer").set({
      type: answer.type,
      sdp: answer.sdp
    });

    // Listen for caller ICE candidates
    roomRef.child("callerCandidates").on("child_added", snapshot => {
      const data = snapshot.val();
      if (!data) return;
      console.log("[Room] Got caller ICE candidate from DB");
      const candidate = new RTCIceCandidate(data);
      peerConnection.addIceCandidate(candidate).catch(console.error);
    });

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
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.close();
      peerConnection = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      remoteStream = null;
    }

    clearVideos();

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
    if (peerConnection) {
      peerConnection.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (roomRef && roomId) {
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
  if (urlRoomId) {
    roomIdInput.value = urlRoomId;
    joinRoomById(urlRoomId).catch(console.error);
  }
});
