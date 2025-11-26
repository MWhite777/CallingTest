// -------------------------------------------------------------
// Firebase + WebRTC Calling App
// With device selectors + room cleanup + URL room param
// -------------------------------------------------------------

// Firebase initialization (same as before)
const firebaseConfig = {
    apiKey: "YOUR_KEY",
    authDomain: "YOUR_DOMAIN",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_BUCKET",
    messagingSenderId: "YOUR_SENDER",
    appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// -------------------------------------------------------------
// Global state
// -------------------------------------------------------------
let localStream = null;
let remoteStreams = {};
let peerConnections = {};
let roomId = null;
let inactivityTimer = null;

// -------------------------------------------------------------
// Utility: Create random room code
// -------------------------------------------------------------
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8); // case‑sensitive
}

// -------------------------------------------------------------
// Cleanup: Delete room if empty for 10 minutes
// -------------------------------------------------------------
function startInactivityMonitor(roomId) {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    inactivityTimer = setTimeout(async () => {
        let roomRef = db.collection("calls").doc(roomId);
        let roomSnap = await roomRef.get();

        if (!roomSnap.exists) return;

        let data = roomSnap.data();
        if (!data || !data.participants || data.participants.length === 0) {
            console.log("Room empty for 10 minutes, deleting...");
            await roomRef.delete();
        }
    }, 10 * 60 * 1000);
}

// -------------------------------------------------------------
// Join screen → Select mic/camera BEFORE permission request
// -------------------------------------------------------------
async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const micSelect = document.getElementById("micSelect");
    const camSelect = document.getElementById("camSelect");

    micSelect.innerHTML = "";
    camSelect.innerHTML = "";

    devices.forEach(d => {
        let option = document.createElement("option");
        option.value = d.deviceId;
        option.text = d.label || (d.kind === "audioinput" ? "Microphone" : "Camera");

        if (d.kind === "audioinput") micSelect.appendChild(option);
        if (d.kind === "videoinput") camSelect.appendChild(option);
    });
}

document.getElementById("micSelect").addEventListener("change", restartMedia);
document.getElementById("camSelect").addEventListener("change", restartMedia);

// -------------------------------------------------------------
// Apply selected mic/camera
// -------------------------------------------------------------
async function restartMedia() {
    if (!localStream) return;

    const micId = document.getElementById("micSelect").value;
    const camId = document.getElementById("camSelect").value;

    const newStream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: camId ? { deviceId: { exact: camId } } : true
    });

    localStream.getTracks().forEach(t => t.stop());

    localStream = newStream;

    document.getElementById("localVideo").srcObject = localStream;

    // Replace peer track
    for (const id in peerConnections) {
        const pc = peerConnections[id];

        const senders = pc.getSenders();
        senders.forEach(sender => {
            if (sender.track?.kind === "audio") {
                const n = localStream.getAudioTracks()[0];
                if (n) sender.replaceTrack(n);
            }
            if (sender.track?.kind === "video") {
                const n = localStream.getVideoTracks()[0];
                if (n) sender.replaceTrack(n);
            }
        });
    }
}

// -------------------------------------------------------------
// Create Room
// -------------------------------------------------------------
async function createRoom() {
    roomId = generateRoomId();

    // Update URL
    window.history.pushState({}, "", `?room=${roomId}`);

    const roomRef = db.collection("calls").doc(roomId);
    await roomRef.set({ participants: [] });

    document.getElementById("joinCodeDisplay").innerText = roomId;

    await startCall(roomId);
}

// -------------------------------------------------------------
// Join Room
// -------------------------------------------------------------
async function joinRoom() {
    const code = document.getElementById("joinCode").value.trim();
    if (!code) return alert("Enter room code!");

    roomId = code;

    window.history.pushState({}, "", `?room=${roomId}`);

    await startCall(roomId);
}

// -------------------------------------------------------------
// Start call logic
// -------------------------------------------------------------
async function startCall(roomId) {
    await listDevices();

    const micId = document.getElementById("micSelect").value;
    const camId = document.getElementById("camSelect").value;

    localStream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: camId ? { deviceId: { exact: camId } } : true
    });

    document.getElementById("localVideo").srcObject = localStream;

    const roomRef = db.collection("calls").doc(roomId);
    const roomSnap = await roomRef.get();

    if (!roomSnap.exists) {
        alert("Room does not exist.");
        return;
    }

    const pc = createPeerConnection(roomRef);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // participant join
    await roomRef.update({
        participants: firebase.firestore.FieldValue.arrayUnion("user")
    });

    startInactivityMonitor(roomId);
}

// -------------------------------------------------------------
// Create WebRTC Peer Connection
// -------------------------------------------------------------
function createPeerConnection(roomRef) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = event => {
        if (event.candidate) {
            roomRef.collection("ice").add(event.candidate.toJSON());
        }
    };

    pc.ontrack = event => {
        let stream = event.streams[0];
        const id = stream.id;

        if (!remoteStreams[id]) {
            remoteStreams[id] = stream;

            let video = document.createElement("video");
            video.autoplay = true;
            video.srcObject = stream;

            document.getElementById("remoteVideos").appendChild(video);
        }
    };

    return pc;
}

// -------------------------------------------------------------
// End Call
// -------------------------------------------------------------
async function leaveCall() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }

    if (roomId) {
        await db.collection("calls").doc(roomId).update({
            participants: firebase.firestore.FieldValue.arrayRemove("user")
        });

        startInactivityMonitor(roomId);
    }

    window.location.href = "index.html";
}
