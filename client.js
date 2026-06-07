const ITERATIONS = 250000;
const LEGACY_STORAGE_KEY = "private-wallet:v1";
const LEGACY_SALT_KEY = "private-wallet:salt";
const LEGACY_PROFILES_KEY = "private-wallet:profiles:v2";
const PUBLIC_PROFILE_ID = "public";

const state = {
  profiles: [],
  activeProfileId: null,
  activeProfile: null,
  key: null,
  cards: [],
  currentId: null,
  frontImage: "",
  backImage: "",
};

const $ = (id) => document.getElementById(id);

const lockView = $("lock-view");
const walletView = $("wallet-view");
const homeActions = $("home-actions");
const unlockForm = $("unlock-form");
const createProfileForm = $("create-profile-form");
const profilesPanel = $("profiles-panel");
const profilesList = $("profiles-list");
const profilesEmpty = $("profiles-empty");
const passwordInput = $("password");
const lockHelp = $("lock-help");
const cardsList = $("cards-list");
const emptyState = $("empty-state");
const searchInput = $("search");
const cardDialog = $("card-dialog");
const viewDialog = $("view-dialog");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

init();

async function init() {
  bindEvents();
  showHome();

  if (!globalThis.crypto?.subtle) {
    setHelp("Questo browser non permette la cifratura qui. Apri il sito da HTTPS o da localhost.", true);
    $("new-password").disabled = true;
    passwordInput.disabled = true;
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
  }

  await migrateLegacyProfiles();
  await loadProfiles({ keepScreen: true });
}

function bindEvents() {
  $("show-login").addEventListener("click", showAccess);
  $("show-register").addEventListener("click", showRegister);
  $("back-from-profiles").addEventListener("click", showHome);
  $("back-from-register").addEventListener("click", showHome);
  unlockForm.addEventListener("submit", unlock);
  createProfileForm.addEventListener("submit", createProfile);
  $("back-to-profiles").addEventListener("click", showAccess);
  $("lock-button").addEventListener("click", lock);
  $("add-card").addEventListener("click", () => openCardForm());
  $("close-card-form").addEventListener("click", () => cardDialog.close());
  $("card-form").addEventListener("submit", saveCard);
  $("delete-card").addEventListener("click", deleteCurrentCard);
  $("export-data").addEventListener("click", exportVault);
  $("import-data").addEventListener("change", importVault);
  $("close-viewer").addEventListener("click", () => viewDialog.close());
  $("edit-current").addEventListener("click", editCurrentFromViewer);
  searchInput.addEventListener("input", renderCards);
  $("front-image").addEventListener("change", (event) => readImage(event, "front"));
  $("back-image").addEventListener("change", (event) => readImage(event, "back"));
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("SERVER_OFFLINE");
  }

  if (!response.ok) {
    let message = await response.text();
    try {
      message = JSON.parse(message).error || message;
    } catch {}
    throw new Error(message || `Errore ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadProfiles(options = {}) {
  try {
    state.profiles = await api("/api/profiles");
    if (!state.profiles.some((profile) => profile.public)) {
      await api("/api/profiles", {
        method: "POST",
        body: JSON.stringify({
          name: "Famiglia",
          public: true,
          vault: { public: true, cards: [] },
        }),
      });
      state.profiles = await api("/api/profiles");
    }
    renderProfiles();
    if (!options.keepScreen) showHome();
  } catch {
    state.profiles = [];
    renderProfiles();
    if (!options.keepScreen) showHome();
    setHelp("Il server privato non e acceso. Avvia il programma con AVVIA-PORTAFOGLIO.bat.", true);
  }
}

function renderProfiles() {
  profilesEmpty.classList.toggle("hidden", state.profiles.length > 0);
  profilesList.innerHTML = "";

  for (const profile of state.profiles) {
    const button = document.createElement("button");
    button.className = "profile-button";
    button.type = "button";
    if (profile.public) button.dataset.public = "true";
    button.innerHTML = `
      <span class="profile-avatar" aria-hidden="true"></span>
      <span class="profile-label">
        <span class="profile-name">${escapeHtml(profile.public ? "Famiglia" : profile.name)}</span>
        ${profile.public ? '<span class="profile-note">senza password</span>' : ""}
      </span>
    `;
    button.addEventListener("click", () => selectProfile(profile.id));
    profilesList.append(button);
  }
}

function hideEntryPanels() {
  homeActions.classList.add("hidden");
  profilesPanel.classList.add("hidden");
  unlockForm.classList.add("hidden");
  createProfileForm.classList.add("hidden");
}

function showHome() {
  state.activeProfileId = null;
  state.activeProfile = null;
  hideEntryPanels();
  homeActions.classList.remove("hidden");
  setHelp("Scegli Accedi se hai gia un profilo, oppure Registrati per crearne uno.");
}

function showAccess() {
  state.activeProfileId = null;
  state.activeProfile = null;
  passwordInput.value = "";
  hideEntryPanels();
  renderProfiles();
  profilesPanel.classList.remove("hidden");
  setHelp("Scegli un profilo esistente.");
}

function showRegister() {
  hideEntryPanels();
  createProfileForm.classList.remove("hidden");
  $("profile-name").focus();
  setHelp("Inserisci nome e password per creare un profilo nel programma.");
}

async function selectProfile(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  state.activeProfileId = profile.id;
  state.activeProfile = null;
  $("selected-profile-name").textContent = profile.name;
  hideEntryPanels();
  if (profile.public) {
    try {
      const fullProfile = await api(`/api/profiles/${profile.id}`);
      await openPublicProfile(fullProfile);
    } catch (error) {
      setHelp(error.message === "SERVER_OFFLINE" ? "Il server non e raggiungibile." : "Non riesco ad aprire lo spazio Famiglia.", true);
      showAccess();
    }
    return;
  }
  unlockForm.classList.remove("hidden");
  passwordInput.value = "";
  passwordInput.focus();
  setHelp("Inserisci la password di questo profilo.");
}

async function createProfile(event) {
  event.preventDefault();
  const name = $("profile-name").value.trim();
  const password = $("new-password").value;

  if (!name) {
    setHelp("Inserisci un nome per il profilo.", true);
    return;
  }

  if (password.length < 8) {
    setHelp("Usa una password di almeno 8 caratteri.", true);
    return;
  }

  try {
    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await deriveKey(password, fromBase64(salt));
    const vault = await encryptCards([], key);
    const profile = await api("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ name, salt, vault }),
    });

    state.profiles.push({ id: profile.id, name: profile.name });
    state.activeProfileId = profile.id;
    state.activeProfile = profile;
    state.key = key;
    state.cards = [];
    $("profile-name").value = "";
    $("new-password").value = "";
    hideEntryPanels();
    openWallet(profile);
  } catch (error) {
    if (error.message === "SERVER_OFFLINE") {
      setHelp("Non posso salvare il profilo perche il server privato non e acceso. Avvia AVVIA-PORTAFOGLIO.bat e riprova.", true);
      return;
    }
    setHelp(error.message || "Non sono riuscito a registrare il profilo.", true);
  }
}

async function unlock(event) {
  event.preventDefault();
  const password = passwordInput.value;
  if (password.length < 8) {
    setHelp("Inserisci la password completa.", true);
    return;
  }

  try {
    const profile = await api(`/api/profiles/${state.activeProfileId}`);
    const key = await deriveKey(password, fromBase64(profile.salt));
    state.key = key;
    state.activeProfile = profile;
    state.cards = await decryptVault(profile.vault, key);
    passwordInput.value = "";
    openWallet(profile);
  } catch (error) {
    state.key = null;
    setHelp(error.message === "SERVER_OFFLINE" ? "Il server privato non e acceso. Avvia AVVIA-PORTAFOGLIO.bat." : "Password non corretta.", true);
  }
}

async function lock() {
  state.activeProfileId = null;
  state.activeProfile = null;
  state.key = null;
  state.cards = [];
  state.currentId = null;
  walletView.classList.add("hidden");
  lockView.classList.remove("hidden");
  await loadProfiles();
}

async function openPublicProfile(profile) {
  state.activeProfileId = profile.id;
  state.activeProfile = profile;
  state.key = null;
  state.cards = profile.vault?.cards || [];
  openWallet(profile);
}

function setHelp(message, isError = false) {
  lockHelp.textContent = message;
  lockHelp.style.color = isError ? "#b73838" : "";
}

function openWallet(profile) {
  $("active-profile-label").textContent = profile.name;
  lockView.classList.add("hidden");
  walletView.classList.remove("hidden");
  renderCards();
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptCards(cards, key) {
  if (!key) return { public: true, cards };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(JSON.stringify(cards));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return {
    version: 1,
    iterations: ITERATIONS,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  };
}

async function persist() {
  const vault = state.activeProfile?.public ? { public: true, cards: state.cards } : await encryptCards(state.cards, state.key);
  state.activeProfile.vault = vault;
  await api(`/api/profiles/${state.activeProfileId}/vault`, {
    method: "PUT",
    body: JSON.stringify({ vault }),
  });
}

async function decryptVault(vault, key) {
  if (vault?.public) return vault.cards || [];
  if (typeof vault === "string") vault = JSON.parse(vault);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(vault.iv) },
    key,
    fromBase64(vault.data)
  );
  return JSON.parse(decoder.decode(decrypted));
}

async function readProfileCards(profile) {
  if (profile.public) return profile.vault?.cards || [];
  return [];
}

function renderCards() {
  const query = searchInput.value.trim().toLowerCase();
  const cards = state.cards
    .filter((card) => `${card.name} ${card.type} ${card.code}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  cardsList.innerHTML = "";
  emptyState.classList.toggle("hidden", cards.length > 0);

  for (const card of cards) {
    const button = document.createElement("button");
    button.className = "wallet-card";
    button.type = "button";
    button.addEventListener("click", () => openViewer(card.id));
    button.innerHTML = `
      <div>
        <h2>${escapeHtml(card.name)}</h2>
        <div class="card-meta">
          <span class="chip">${escapeHtml(card.type)}</span>
          ${card.code ? `<span>${escapeHtml(maskCode(card.code))}</span>` : ""}
        </div>
      </div>
      ${card.frontImage ? `<img class="thumb" alt="" src="${card.frontImage}">` : ""}
    `;
    cardsList.append(button);
  }
}

function openCardForm(card = null) {
  state.currentId = card?.id ?? null;
  state.frontImage = card?.frontImage ?? "";
  state.backImage = card?.backImage ?? "";
  $("dialog-title").textContent = card ? "Modifica tessera" : "Nuova tessera";
  $("card-id").value = card?.id ?? "";
  $("card-name").value = card?.name ?? "";
  $("card-type").value = card?.type ?? "Negozio";
  $("card-code").value = card?.code ?? "";
  $("card-notes").value = card?.notes ?? "";
  $("front-image").value = "";
  $("back-image").value = "";
  $("front-label").textContent = state.frontImage ? "Immagine presente" : "Scegli immagine";
  $("back-label").textContent = state.backImage ? "Immagine presente" : "Scegli immagine";
  $("delete-card").classList.toggle("hidden", !card);
  cardDialog.showModal();
}

async function saveCard(event) {
  event.preventDefault();
  const id = $("card-id").value || crypto.randomUUID();
  const card = {
    id,
    name: $("card-name").value.trim(),
    type: $("card-type").value,
    code: $("card-code").value.trim(),
    notes: $("card-notes").value.trim(),
    frontImage: state.frontImage,
    backImage: state.backImage,
    updatedAt: new Date().toISOString(),
  };

  if (!card.name) return;

  const previousCards = [...state.cards];
  const existing = state.cards.findIndex((item) => item.id === id);
  if (existing >= 0) state.cards[existing] = card;
  else state.cards.push(card);

  try {
    await persist();
  } catch (error) {
    state.cards = previousCards;
    alert(error.message || "Non sono riuscito a salvare la tessera.");
    return;
  }
  cardDialog.close();
  renderCards();
}

async function deleteCurrentCard() {
  if (!state.currentId) return;
  const previousCards = [...state.cards];
  state.cards = state.cards.filter((card) => card.id !== state.currentId);
  try {
    await persist();
  } catch (error) {
    state.cards = previousCards;
    alert(error.message || "Non sono riuscito a eliminare la tessera.");
    return;
  }
  cardDialog.close();
  renderCards();
}

function openViewer(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  state.currentId = id;
  $("viewer-type").textContent = card.type;
  $("viewer-name").textContent = card.name;
  $("viewer-notes").textContent = card.notes;
  $("viewer-code").textContent = card.code;
  $("viewer-code").classList.toggle("hidden", !card.code);

  const images = [];
  if (card.frontImage) images.push(`<img src="${card.frontImage}" alt="Fronte ${escapeHtml(card.name)}">`);
  if (card.backImage) images.push(`<img src="${card.backImage}" alt="Retro ${escapeHtml(card.name)}">`);
  $("viewer-images").innerHTML = images.join("");
  viewDialog.showModal();
}

function editCurrentFromViewer() {
  const card = state.cards.find((item) => item.id === state.currentId);
  viewDialog.close();
  if (card) openCardForm(card);
}

async function readImage(event, side) {
  const file = event.target.files?.[0];
  if (!file) return;
  const dataUrl = await shrinkImage(file);
  if (side === "front") {
    state.frontImage = dataUrl;
    $("front-label").textContent = file.name;
  } else {
    state.backImage = dataUrl;
    $("back-label").textContent = file.name;
  }
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const max = 1400;
        const ratio = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function exportVault() {
  if (!state.activeProfile?.vault) return;
  const blob = new Blob([JSON.stringify({
    type: "tessere-private-profile",
    profile: {
      id: crypto.randomUUID(),
      name: state.activeProfile.name,
      salt: state.activeProfile.salt,
      vault: state.activeProfile.vault,
    },
  }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tessere-private-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importVault(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const backup = JSON.parse(text);
  const imported = backup.profile || backup;
  if (!imported.salt || !imported.vault) return;
  await api("/api/profiles", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProfileName(imported.name || "Profilo importato", state.profiles),
      salt: imported.salt,
      vault: imported.vault,
    }),
  });
  await lock();
  setHelp("Backup importato. Clicca il profilo e sbloccalo con la sua password.");
}

function uniqueProfileName(name, profiles) {
  let candidate = name;
  let counter = 2;
  while (profiles.some((profile) => profile.name === candidate)) {
    candidate = `${name} ${counter}`;
    counter += 1;
  }
  return candidate;
}

async function migrateLegacyProfiles() {
  const localProfiles = JSON.parse(localStorage.getItem(LEGACY_PROFILES_KEY) || "[]");
  const legacyVault = localStorage.getItem(LEGACY_STORAGE_KEY);
  const legacySalt = localStorage.getItem(LEGACY_SALT_KEY);
  const candidates = [...localProfiles];

  if (!candidates.length && legacyVault && legacySalt) {
    candidates.push({
      name: "Vecchio portafoglio",
      salt: legacySalt,
      vault: JSON.parse(legacyVault),
    });
  }

  if (!candidates.length) return;

  try {
    const remoteProfiles = await api("/api/profiles");
    for (const profile of candidates) {
      if (!profile.salt || !profile.vault) continue;
      if (remoteProfiles.some((item) => item.name === profile.name)) continue;
      await api("/api/profiles", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name || "Profilo importato",
          salt: profile.salt,
          vault: profile.vault,
        }),
      });
    }
    localStorage.removeItem(LEGACY_PROFILES_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_SALT_KEY);
  } catch {
    // The shared server may not be running yet; the app will show a clear message.
  }
}

async function readProfilesSafe() {
  try {
    return await api("/api/profiles");
  } catch {
    return [];
  }
}

function maskCode(code) {
  if (code.length <= 6) return code;
  return `${code.slice(0, 3)}...${code.slice(-3)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
