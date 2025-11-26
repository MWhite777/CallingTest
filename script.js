/* --------------------------------------------------
   FIREBASE SETUP
-------------------------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* --------------------------------------------------
   UI ELEMENTS
-------------------------------------------------- */
const videoGrid = document.getElementById("video-grid");
const callCodeBubble = document.getElementById("call-code-bubble");

let roomId = null;
let localStream = null;
let peers = {};
let remoteVideos = {};

const iceConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/* --------------------------------------------------
   CREATE ROOM
-------------------------------------------------- */
export async function createRoom() {
    roomId = generateCode();
    const roomRef = ref(db, "rooms/" + roomId);

    await set(roomRef, {
        createdAt: Date.now(),
        offer: null,
        answer: null,
        participants: {}
    });

    callCodeBubble.innerText = roomId;
    callCodeBubble.style.display = "block";

    return roomId;
}

/* --------------------------------------------------
   JOIN ROOM
-------------------------------------------------- */
export async function joinRoom(id) {
    roomId = id;
    callCodeBubble.innerText = roomId;
    callCodeBubble.style.display = "block";

    const roomRef = ref(db, "rooms/" + roomId);

    onValue(roomRef, snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.answer && peers["local-offer"]) {
            peers["local-offer"].setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });
}

/* --------------------------------------------------
   START CALL
-------------------------------------------------- */
export async function startCall() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    addVideoStream("local", localStream, true);

    const pc = createPeer("local-offer");

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const roomRef = ref(db, "rooms/" + roomId + "/offer");
    await set(roomRef, offer);
}

/* --------------------------------------------------
   HANDLE REMOTE PEERS
-------------------------------------------------- */
function createPeer(id) {
    const pc = new RTCPeerConnection(iceConfig);
    peers[id] = pc;

    pc.ontrack = e => {
        if (!remoteVideos[id]) {
            remoteVideos[id] = addVideoStream(id, e.streams[0], false);
            updateLayout();
        }
    };

    return pc;
}

/* --------------------------------------------------
   ADD VIDEO TO GRID
-------------------------------------------------- */
function addVideoStream(id, stream, isLocal) {
    const vid = document.createElement("video");
    vid.srcObject = stream;
    vid.autoplay = true;
    vid.playsInline = true;

    vid.classList.add(isLocal ? "local-video" : "remote-video");
    vid.dataset.id = id;

    if (!isLocal) makeDraggableResizable(vid);

    videoGrid.appendChild(vid);

    updateLayout();

    return vid;
}

/* --------------------------------------------------
   AUTO‑LAYOUT BEHAVIOR
-------------------------------------------------- */
function updateLayout() {
    const remoteCount = document.querySelectorAll(".remote-video").length;

    if (remoteCount === 1) {
        // 1-on-1 mode
        document.querySelectorAll(".remote-video").forEach(v => {
            v.style.position = "absolute";
            v.style.top = "0";
            v.style.left = "0";
            v.style.width = "100%";
            v.style.height = "100%";
            v.style.objectFit = "cover";
        });
    } else {
        // Auto grid mode
        document.querySelectorAll(".remote-video").forEach(v => {
            v.style.position = "";
            v.style.width = "";
            v.style.height = "";
            v.style.top = "";
            v.style.left = "";
            v.style.objectFit = "cover";
        });
    }
}

/* --------------------------------------------------
   DRAG + RESIZE REMOTE VIDEOS + SNAP CORNERS
-------------------------------------------------- */
function makeDraggableResizable(el) {

    el.style.position = "absolute";
    el.style.resize = "both";
    el.style.overflow = "hidden";
    el.style.borderRadius = "10px";
    el.style.border = "2px solid #1a73e8";
    el.style.cursor = "move";

    let x = 0, y = 0, dragging = false;

    el.addEventListener("mousedown", e => {
        dragging = true;
        x = e.clientX - el.offsetLeft;
        y = e.clientY - el.offsetTop;
    });

    window.addEventListener("mousemove", e => {
        if (!dragging) return;

        el.style.left = (e.clientX - x) + "px";
        el.style.top = (e.clientY - y) + "px";
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;

        snapToCorner(el);
    });
}

function snapToCorner(el) {
    const pad = 20;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const left = el.offsetLeft;
    const top = el.offsetTop;

    const dist = {
        TL: left + top,
        TR: (w - left) + top,
        BL: left + (h - top),
        BR: (w - left) + (h - top),
    };

    const corner = Object.entries(dist).sort((a,b) => a[1] - b[1])[0][0];

    switch (corner) {
        case "TL": el.style.left = pad + "px"; el.style.top = pad + "px"; break;
        case "TR": el.style.left = (w - el.offsetWidth - pad) + "px"; el.style.top = pad + "px"; break;
        case "BL": el.style.left = pad + "px"; el.style.top = (h - el.offsetHeight - pad) + "px"; break;
        case "BR": el.style.left = (w - el.offsetWidth - pad) + "px"; el.style.top = (h - el.offsetHeight - pad) + "px"; break;
    }
}

/* --------------------------------------------------
   UTILS
-------------------------------------------------- */
function generateCode() {
    return Math.random().toString(36).substring(2, 8).toLowerCase();
}
