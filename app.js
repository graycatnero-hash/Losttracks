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

const request = indexedDB.open("LostTracksDB", 3);

request.onupgradeneeded = function (event) {
  db = event.target.result;

  // Сохраняем существующие треки
  if (!db.objectStoreNames.contains("tracks")) {
    db.createObjectStore("tracks", {
      keyPath: "id",
      autoIncrement: true
    });
  }

  // Добавляем плейлисты
  if (!db.objectStoreNames.contains("playlists")) {
    db.createObjectStore("playlists", {
      keyPath: "id",
      autoIncrement: true
    });
  }
};

request.onsuccess = function (event) {
  db = event.target.result;

  // Если старый DB уже был открыт,
  // продолжаем нормально
  loadTelegramTracks();
};

request.onerror = function (event) {
  console.error("IndexedDB error:", event.target.error);
};

/* =========================
   DATABASE HELPERS
========================= */

function getStore(name, mode) {
  return db
    .transaction(name, mode)
    .objectStore(name);
}

function getTracks() {
  return new Promise((resolve, reject) => {
    const req = getStore("tracks", "readonly").getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function addTrack(track) {
  return new Promise((resolve, reject) => {
    const req = getStore("tracks", "readwrite").add(track);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getPlaylists() {
  return new Promise((resolve, reject) => {
    const req = getStore("playlists", "readonly").getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function addPlaylist(playlist) {
  return new Promise((resolve, reject) => {
    const req = getStore("playlists", "readwrite").add(playlist);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function savePlaylist(playlist) {
  return new Promise((resolve, reject) => {
    const req = getStore("playlists", "readwrite").put(playlist);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function removePlaylist(id) {
  return new Promise((resolve, reject) => {
    const req = getStore("playlists", "readwrite").delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* =========================
   TELEGRAM
========================= */

async function loadTelegramTracks() {
  try {
    const response = await fetch(API + "/tracks");

    if (!response.ok) {
      throw new Error("Worker error: " + response.status);
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
    const req = getStore("tracks", "readonly").getAll();

    req.onsuccess = () => {
      resolve(
        req.result.find(
          track =>
            track.telegram &&
            track.file_id === fileId
        )
      );
    };

    req.onerror = () => reject(req.error);
  });
}

/* =========================
   MAIN PAGE
========================= */

async function render() {
  if (!db) return;

  const tracks = await getTracks();
  const playlists = await getPlaylists();

  const playlistsElement =
    document.getElementById("playlists");

  if (playlistsElement) {

    let html = `
      <div class="card"
           onclick="openAllTracks()">

        <b>All tracks</b>

        <small>
          ${tracks.length} треков
        </small>

      </div>

      <div class="card"
           onclick="newPlaylist()">

        <b>＋ New playlist</b>

        <small>
          Создать
        </small>

      </div>
    `;

    for (const playlist of playlists) {

      html += `
        <div class="card"
             onclick="openPlaylist(${playlist.id})">

          <b>
            📁 ${escapeHTML(playlist.name)}
          </b>

          <small>
            ${playlist.tracks.length} треков
          </small>

        </div>
      `;
    }

    playlistsElement.innerHTML = html;
  }

  const tracksElement =
    document.getElementById("tracks");

  if (tracksElement) {

    const sortedTracks =
      tracks
        .slice()
        .sort(
          (a, b) =>
            (b.created || 0) -
            (a.created || 0)
        );

    tracksElement.innerHTML =
      sortedTracks.length
        ? sortedTracks
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
}

/* =========================
   TRACK HTML
========================= */

function trackHTML(track) {
  return `
    <div class="track">

      <div class="cover">
        ♫
      </div>

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
        onclick="choosePlaylist(${track.id})">
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

  const track =
    tracks.find(
      item => item.id === id
    );

  if (!track) return;

  const audio =
    document.getElementById("audio");

  if (!audio) return;

  // Telegram
  if (track.telegram) {

    audio.src =
      API +
      "/audio?file_id=" +
      encodeURIComponent(
        track.file_id
      );

  }

  // Local
  else if (track.file) {

    audio.src =
      URL.createObjectURL(
        track.file
      );

  }

  else {
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
      "Audio playback error:",
      error
    );
  }
}

/* =========================
   LOCAL FILES
========================= */

const uploadBtn =
  document.getElementById("uploadBtn");

if (uploadBtn) {
  uploadBtn.onclick = () => {
    document
      .getElementById("fileInput")
      .click();
  };
}

const addBtn =
  document.getElementById("addBtn");

if (addBtn) {
  addBtn.onclick = () => {
    document
      .getElementById("fileInput")
      .click();
  };
}

const fileInput =
  document.getElementById("fileInput");

if (fileInput) {

  fileInput.onchange =
    async function (event) {

      for (
        const file of event.target.files
      ) {

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

      await render();
    };
}

/* =========================
   ALL TRACKS
========================= */

const allBtn =
  document.getElementById("allBtn");

if (allBtn) {
  allBtn.onclick = openAllTracks;
}

async function openAllTracks() {

  currentPlaylistId = null;

  show("playlist");

  const header =
    document.getElementById(
      "playlistHeader"
    );

  if (header) {
    header.innerHTML =
      "<h2>Все треки</h2>";
  }

  const tracks =
    await getTracks();

  const container =
    document.getElementById(
      "playlistTracks"
    );

  if (!container) return;

  container.innerHTML =
    tracks.length
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

const newPlaylistBtn =
  document.getElementById(
    "newPlaylistBtn"
  );

if (newPlaylistBtn) {
  newPlaylistBtn.onclick =
    newPlaylist;
}

async function newPlaylist() {

  const name =
    prompt(
      "Название плейлиста:"
    );

  if (!name || !name.trim()) {
    return;
  }

  await addPlaylist({

    name: name.trim(),

    tracks: [],

    created: Date.now()

  });

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
      p => p.id === id
    );

  if (!playlist) return;

  currentPlaylistId = id;

  show("playlist");

  const header =
    document.getElementById(
      "playlistHeader"
    );

  if (header) {

    header.innerHTML = `

      <h2>
        📁 ${escapeHTML(
          playlist.name
        )}
      </h2>

      <div>

        <button
          onclick="addTracksToPlaylist(${id})">
          ＋ Добавить треки
        </button>

        <button
          onclick="deletePlaylist(${id})">
          🗑
        </button>

      </div>

    `;
  }

  await renderPlaylist(
    playlist
  );
}

/* =========================
   PLAYLIST CONTENT
========================= */

async function renderPlaylist(
  playlist
) {

  const tracks =
    await getTracks();

  const playlistTracks =
    playlist.tracks
      .map(
        id =>
          tracks.find(
            track =>
              track.id === id
          )
      )
      .filter(Boolean);

  const container =
    document.getElementById(
      "playlistTracks"
    );

  if (!container) return;

  if (!playlistTracks.length) {

    container.innerHTML = `
      <div class="empty">
        Плейлист пуст.<br>
        Нажми «Добавить треки».
      </div>
    `;

    return;
  }

  container.innerHTML =
    playlistTracks
      .map(
        track => `

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
              onclick="removeTrackFromPlaylist(
                ${playlist.id},
                ${track.id}
              )">
              −
            </button>

          </div>

        `
      )
      .join("");
}

/* =========================
   CHOOSE PLAYLIST
========================= */

async function choosePlaylist(
  trackId
) {

  const playlists =
    await getPlaylists();

  if (!playlists.length) {

    const create =
      confirm(
        "Плейлистов пока нет.\n\nСоздать плейлист?"
      );

    if (create) {
      await newPlaylist();
    }

    return;
  }

  let message =
    "Выбери плейлист:\n\n";

  playlists.forEach(
    (playlist, index) => {

      message +=
        `${index + 1}. ${playlist.name}\n`;

    }
  );

  const answer =
    prompt(message);

  if (!answer) return;

  const number =
    Number(answer);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > playlists.length
  ) {

    alert(
      "Неверный номер плейлиста."
    );

    return;
  }

  const playlist =
    playlists[number - 1];

  if (
    playlist.tracks.includes(
      trackId
    )
  ) {

    alert(
      "Этот трек уже есть в плейлисте."
    );

    return;
  }

  playlist.tracks.push(
    trackId
  );

  await savePlaylist(
    playlist
  );

  alert(
    `«${playlist.name}» ← трек добавлен`
  );

  await render();
}

/* =========================
   ADD TRACKS FROM PLAYLIST
========================= */

async function addTracksToPlaylist(
  playlistId
) {

  const tracks =
    await getTracks();

  if (!tracks.length) {

    alert(
      "Треков пока нет."
    );

    return;
  }

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      p => p.id === playlistId
    );

  if (!playlist) return;

  let message =
    "Выбери номера треков.\n" +
    "Можно несколько через запятую.\n\n";

  tracks.forEach(
    (track, index) => {

      message +=
        `${index + 1}. ${track.name}\n`;

    }
  );

  const answer =
    prompt(message);

  if (!answer) return;

  const numbers =
    answer
      .split(",")
      .map(
        x =>
          Number(x.trim()) - 1
      )
      .filter(
        x =>
          Number.isInteger(x) &&
          x >= 0 &&
          x < tracks.length
      );

  for (
    const index of numbers
  ) {

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

  await savePlaylist(
    playlist
  );

  await openPlaylist(
    playlistId
  );

  await render();
}

/* =========================
   REMOVE FROM PLAYLIST
========================= */

async function removeTrackFromPlaylist(
  playlistId,
  trackId
) {

  const playlists =
    await getPlaylists();

  const playlist =
    playlists.find(
      p => p.id === playlistId
    );

  if (!playlist) return;

  playlist.tracks =
    playlist.tracks.filter(
      id => id !== trackId
    );

  await savePlaylist(
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

  const yes =
    confirm(
      `Удалить плейлист «${playlist.name}»?`
    );

  if (!yes) return;

  await removePlaylist(id);

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
    .forEach(
      screen =>
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
   HTML ESCAPE
========================= */

function escapeHTML(text) {

  return String(text).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
    }
