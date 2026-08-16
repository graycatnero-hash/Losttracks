const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "https://divine-wood-93bc.graycatnero.workers.dev";

let db;
let currentPlaylistId = null;

/* =========================
   DATABASE
========================= */

const request = indexedDB.open("LostTracksDB", 2);

request.onupgradeneeded = function (event) {
  db = event.target.result;

  if (!db.objectStoreNames.contains("tracks")) {
    db.createObjectStore("tracks", {
      keyPath: "id",
      autoIncrement: true
    });
  }

  if (!db.objectStoreNames.contains("playlists")) {
    db.createObjectStore("playlists", {
      keyPath: "id",
      autoIncrement: true
    });
  }
};

request.onsuccess = function (event) {
  db = event.target.result;
  loadTelegramTracks();
};

/* =========================
   DATABASE HELPERS
========================= */

function store(name, mode) {
  return db
    .transaction(name, mode)
    .objectStore(name);
}

function getTracks() {
  return new Promise((resolve, reject) => {
    const req = store("tracks", "readonly").getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function addTrack(track) {
  return new Promise((resolve, reject) => {
    const req = store("tracks", "readwrite").add(track);

    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function getPlaylists() {
  return new Promise((resolve, reject) => {
    const req = store("playlists", "readonly").getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function addPlaylist(playlist) {
  return new Promise((resolve, reject) => {
    const req = store("playlists", "readwrite").add(playlist);

    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function updatePlaylist(playlist) {
  return new Promise((resolve, reject) => {
    const req = store("playlists", "readwrite").put(playlist);

    req.onsuccess = () => resolve();
    req.onerror = reject;
  });
}

function deletePlaylistFromDB(id) {
  return new Promise((resolve, reject) => {
    const req = store("playlists", "readwrite").delete(id);

    req.onsuccess = () => resolve();
    req.onerror = reject;
  });
}

/* =========================
   TELEGRAM TRACKS
========================= */

async function loadTelegramTracks() {
  try {
    const response = await fetch(API + "/tracks");

    if (!response.ok) {
      throw new Error("Worker: " + response.status);
    }

    const telegramTracks = await response.json();

    for (const track of telegramTracks) {
      const exists = await findTelegramTrack(track.file_id);

      if (!exists) {
        await addTrack({
          telegram: true,
          file_id: track.file_id,
          name: track.name || "Без названия",
          artist: track.artist || "Unknown",
          mime_type: track.mime_type || "audio/mpeg",
          duration: track.duration || 0,
          created:
            track.created ||
            track.added_at ||
            Date.now()
        });
      }
    }

    await render();

  } catch (error) {
    console.error("Telegram tracks error:", error);
    await render();
  }
}

function findTelegramTrack(fileId) {
  return new Promise((resolve, reject) => {
    const req = store("tracks", "readonly").getAll();

    req.onsuccess = () => {
      resolve(
        req.result.find(
          track =>
            track.telegram &&
            track.file_id === fileId
        )
      );
    };

    req.onerror = reject;
  });
}

/* =========================
   MAIN RENDER
========================= */

async function render() {
  if (!db) return;

  const tracks = await getTracks();
  const playlists = await getPlaylists();

  /* Playlists */

  let playlistHTML = `
    <div class="card" onclick="openAllTracks()">
      <b>All tracks</b>
      <small>${tracks.length} треков</small>
    </div>

    <div class="card" onclick="newPlaylist()">
      <b>＋ New playlist</b>
      <small>Создать</small>
    </div>
  `;

  if (playlists.length) {
    playlistHTML += playlists
      .map(playlist => `
        <div class="card"
             onclick="openPlaylist(${playlist.id})">

          <b>📁 ${escapeHTML(playlist.name)}</b>

          <small>
            ${playlist.tracks.length} треков
          </small>

        </div>
      `)
      .join("");
  }

  document.getElementById("playlists").innerHTML =
    playlistHTML;

  /* Recent tracks */

  document.getElementById("tracks").innerHTML =
    tracks.length
      ? tracks
          .slice()
          .sort((a, b) =>
            (b.created || 0) -
            (a.created || 0)
          )
          .slice(0, 8)
          .map(trackHTML)
          .join("")
      : `
        <div class="empty">
          Пока нет треков.<br>
          Добавь первый файл.
        </div>
      `;
}

/* =========================
   TRACK CARD
========================= */

function trackHTML(track) {
  return `
    <div class="track">

      <div class="cover">♫</div>

      <div class="meta">
        <b>
          ${escapeHTML(track.name)}
        </b>

        <small>
          ${escapeHTML(
            track.artist || "Unknown"
          )}
        </small>
      </div>

      <button
        class="play"
        onclick="playTrack(${track.id})">
        ▶
      </button>

      <button
        class="play"
        onclick="showAddToPlaylist(${track.id})">
        ＋
      </button>

    </div>
  `;
}

/* =========================
   PLAYER
========================= */

async function playTrack(id) {
  const tracks = await getTracks();

  const track = tracks.find(
    item => item.id === id
  );

  if (!track) return;

  const audio =
    document.getElementById("audio");

  if (track.telegram) {

    audio.src =
      API +
      "/audio?file_id=" +
      encodeURIComponent(
        track.file_id
      );

  } else if (track.file) {

    audio.src =
      URL.createObjectURL(track.file);

  } else {
    return;
  }

  document.getElementById(
    "nowTitle"
  ).textContent = track.name;

  document.getElementById(
    "nowArtist"
  ).textContent =
    track.artist || "LostTracks";

  document
    .getElementById("player")
    .classList.remove("hidden");

  try {
    await audio.play();
  } catch (error) {
    console.error(
      "Audio error:",
      error
    );
  }
}

/* =========================
   LOCAL UPLOAD
========================= */

document.getElementById(
  "uploadBtn"
).onclick = function () {

  document
    .getElementById("fileInput")
    .click();

};

document.getElementById(
  "addBtn"
).onclick = function () {

  document
    .getElementById("fileInput")
    .click();

};

document.getElementById(
  "fileInput"
).onchange = async function (event) {

  for (const file of event.target.files) {

    await addTrack({
      name:
        file.name.replace(
          /\.[^/.]+$/,
          ""
        ),

      artist: "Unknown",

      file: file,

      created: Date.now()
    });

  }

  event.target.value = "";

  render();
};

/* =========================
   ALL TRACKS
========================= */

document.getElementById(
  "allBtn"
).onclick = openAllTracks;

async function openAllTracks() {

  currentPlaylistId = null;

  show("playlist");

  document.getElementById(
    "playlistHeader"
  ).innerHTML = `
    <h2>Все треки</h2>
  `;

  const tracks = await getTracks();

  document.getElementById(
    "playlistTracks"
  ).innerHTML = tracks.length

    ? tracks.map(trackHTML).join("")

    : `
      <div class="empty">
        Нет треков
      </div>
    `;
}

/* =========================
   NEW PLAYLIST
========================= */

document.getElementById(
  "newPlaylistBtn"
).onclick = newPlaylist;

async function newPlaylist() {

  const name = prompt(
    "Название плейлиста"
  );

  if (!name || !name.trim()) {
    return;
  }

  const playlist = {

    name: name.trim(),

    tracks: [],

    created: Date.now()

  };

  await addPlaylist(playlist);

  await render();

}

/* =========================
   OPEN PLAYLIST
========================= */

async function openPlaylist(id) {

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      item => item.id === id
    );

  if (!playlist) return;

  currentPlaylistId = id;

  show("playlist");

  document.getElementById(
    "playlistHeader"
  ).innerHTML = `

    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    ">

      <h2>
        📁 ${escapeHTML(
          playlist.name
        )}
      </h2>

      <button
        onclick="deletePlaylist(${id})">
        🗑
      </button>

    </div>

    <button
      onclick="addTracksToCurrentPlaylist()">
      ＋ Добавить треки
    </button>

  `;

  await renderPlaylistTracks(
    playlist
  );
}

/* =========================
   RENDER PLAYLIST TRACKS
========================= */

async function renderPlaylistTracks(
  playlist
) {

  const tracks =
    await getTracks();

  const playlistTracks =
    playlist.tracks
      .map(id =>
        tracks.find(
          track =>
            track.id === id
        )
      )
      .filter(Boolean);

  document.getElementById(
    "playlistTracks"
  ).innerHTML =

    playlistTracks.length

      ? playlistTracks
          .map(
            track =>
              playlistTrackHTML(
                track,
                playlist.id
              )
          )
          .join("")

      : `
        <div class="empty">
          Плейлист пуст.<br>
          Добавь в него треки.
        </div>
      `;
}

function playlistTrackHTML(
  track,
  playlistId
) {

  return `

    <div class="track">

      <div class="cover">
        ♫
      </div>

      <div class="meta">

        <b>
          ${escapeHTML(
            track.name
          )}
        </b>

        <small>
          ${escapeHTML(
            track.artist ||
            "Unknown"
          )}
        </small>

      </div>

      <button
        class="play"
        onclick="playTrack(${track.id})">
        ▶
      </button>

      <button
        class="play"
        onclick="removeFromPlaylist(
          ${playlistId},
          ${track.id}
        )">
        −
      </button>

    </div>

  `;
}

/* =========================
   ADD TRACK TO PLAYLIST
========================= */

async function showAddToPlaylist(
  trackId
) {

  const playlists =
    await getPlaylists();

  if (!playlists.length) {

    const create =
      confirm(
        "У тебя пока нет плейлистов.\n\nСоздать новый?"
      );

    if (create) {
      await newPlaylist();
    }

    return;
  }

  let text =
    "Выбери плейлист:\n\n";

  playlists.forEach(
    (playlist, index) => {

      text +=
        `${index + 1}. ${playlist.name}\n`;

    }
  );

  text +=
    "\nВведи номер плейлиста:";

  const answer =
    prompt(text);

  if (!answer) return;

  const index =
    Number(answer) - 1;

  if (
    index < 0 ||
    index >= playlists.length
  ) {

    alert(
      "Неверный номер."
    );

    return;
  }

  const playlist =
    playlists[index];

  if (
    !playlist.tracks.includes(
      trackId
    )
  ) {

    playlist.tracks.push(
      trackId
    );

    await updatePlaylist(
      playlist
    );

    alert(
      `Трек добавлен в «${playlist.name}»`
    );

  } else {

    alert(
      "Этот трек уже есть в плейлисте."
    );

  }

}

/* =========================
   ADD MANY TRACKS
========================= */

async function addTracksToCurrentPlaylist() {

  if (!currentPlaylistId) {
    return;
  }

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      p =>
        p.id ===
        currentPlaylistId
    );

  if (!playlist) return;

  const tracks =
    await getTracks();

  if (!tracks.length) {

    alert(
      "У тебя пока нет треков."
    );

    return;
  }

  let text =
    "Выбери треки по номерам.\n" +
    "Например: 1,3,5\n\n";

  tracks.forEach(
    (track, index) => {

      text +=
        `${index + 1}. ${track.name}\n`;

    }
  );

  const answer =
    prompt(text);

  if (!answer) return;

  const numbers =
    answer
      .split(",")
      .map(x =>
        Number(x.trim()) - 1
      )
      .filter(
        x =>
          x >= 0 &&
          x < tracks.length
      );

  for (const index of numbers) {

    const track =
      tracks[index];

    if (
      !playlist.tracks.includes(
        track.id
      )
    ) {

      playlist.tracks.push(
        track.id
      );

    }

  }

  await updatePlaylist(
    playlist
  );

  await openPlaylist(
    playlist.id
  );
}

/* =========================
   REMOVE TRACK
========================= */

async function removeFromPlaylist(
  playlistId,
  trackId
) {

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      p =>
        p.id === playlistId
    );

  if (!playlist) return;

  playlist.tracks =
    playlist.tracks.filter(
      id =>
        id !== trackId
    );

  await updatePlaylist(
    playlist
  );

  await openPlaylist(
    playlistId
  );
}

/* =========================
   DELETE PLAYLIST
========================= */

async function deletePlaylist(
  id
) {

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      p => p.id === id
    );

  if (!playlist) return;

  const confirmed =
    confirm(
      `Удалить плейлист «${playlist.name}»?`
    );

  if (!confirmed) return;

  await deletePlaylistFromDB(
    id
  );

  currentPlaylistId = null;

  await render();

  show("home");
}

/* =========================
   SHOW SCREEN
========================= */

function show(id) {

  document
    .querySelectorAll(".screen")
    .forEach(screen =>
      screen.classList.remove(
        "active"
      )
    );

  const element =
    document.getElementById(id);

  if (element) {
    element.classList.add(
      "active"
    );
  }
}

/* =========================
   ESCAPE HTML
========================= */

function escapeHTML(text) {

  return String(text).replace(
    /[&<>"']/g,
    function (character) {

      return {

        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"

      }[character];

    }
  );

}
