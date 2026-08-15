const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

let db;

const request = indexedDB.open("LostTracksDB", 1);

request.onupgradeneeded = function (event) {
  db = event.target.result;

  if (!db.objectStoreNames.contains("tracks")) {
    db.createObjectStore("tracks", {
      keyPath: "id",
      autoIncrement: true
    });
  }
};

request.onsuccess = function (event) {
  db = event.target.result;
  render();
};

function store(mode) {
  return db.transaction("tracks", mode).objectStore("tracks");
}

function getTracks() {
  return new Promise((resolve, reject) => {
    const request = store("readonly").getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
}

function addTrack(track) {
  return new Promise((resolve, reject) => {
    const request = store("readwrite").add(track);

    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
}

async function render() {
  if (!db) return;

  const tracks = await getTracks();

  document.getElementById("playlists").innerHTML = `
    <div class="card" onclick="openPlaylist('All tracks')">
      <b>All tracks</b>
      <small>${tracks.length} треков</small>
    </div>

    <div class="card" onclick="newPlaylist()">
      <b>＋ New playlist</b>
      <small>Создать</small>
    </div>
  `;

  document.getElementById("tracks").innerHTML =
    tracks.length
      ? tracks.slice(-8).reverse().map(trackHTML).join("")
      : '<div class="empty">Пока нет треков.<br>Добавь первый файл.</div>';
}

function trackHTML(track) {
  return `
    <div class="track">
      <div class="cover">♫</div>

      <div class="meta">
        <b>${escapeHTML(track.name)}</b>
        <small>${escapeHTML(track.artist || "Unknown")}</small>
      </div>

      <button class="play" onclick="playTrack(${track.id})">
        ▶
      </button>
    </div>
  `;
}

async function playTrack(id) {
  const tracks = await getTracks();
  const track = tracks.find(item => item.id === id);

  if (!track) return;

  const audio = document.getElementById("audio");

  audio.src = URL.createObjectURL(track.file);
  audio.play();

  document.getElementById("nowTitle").textContent = track.name;
  document.getElementById("nowArtist").textContent =
    track.artist || "LostTracks";

  document.getElementById("player").classList.remove("hidden");
}

document.getElementById("uploadBtn").onclick = function () {
  document.getElementById("fileInput").click();
};

document.getElementById("addBtn").onclick = function () {
  document.getElementById("fileInput").click();
};

document.getElementById("fileInput").onchange = async function (event) {
  for (const file of event.target.files) {
    await addTrack({
      name: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Unknown",
      file: file,
      created: Date.now()
    });
  }

  event.target.value = "";
  render();
};

document.getElementById("allBtn").onclick = async function () {
  show("playlist");

  document.getElementById("playlistHeader").innerHTML =
    "<h2>Все треки</h2>";

  const tracks = await getTracks();

  document.getElementById("playlistTracks").innerHTML =
    tracks.length
      ? tracks.map(trackHTML).join("")
      : '<div class="empty">Нет треков</div>';
};

document.getElementById("newPlaylistBtn").onclick = newPlaylist;

function newPlaylist() {
  const name = prompt("Название плейлиста");

  if (name) {
    alert(
      "Плейлист «" +
      name +
      "» создан. Сохранение плейлистов добавим следующим этапом."
    );
  }
}

async function openPlaylist(name) {
  show("playlist");

  document.getElementById("playlistHeader").innerHTML =
    "<h2>" + escapeHTML(name) + "</h2>";

  const tracks = await getTracks();

  document.getElementById("playlistTracks").innerHTML =
    tracks.length
      ? tracks.map(trackHTML).join("")
      : '<div class="empty">Нет треков</div>';
}

function show(id) {
  document
    .querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  document.getElementById(id).classList.add("active");
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}
