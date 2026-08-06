(() => {
  "use strict";

  const socket = io();

  // --- Ekranlar ---------------------------------------------------------
  const joinScreen = document.getElementById("join-screen");
  const chatScreen = document.getElementById("chat-screen");
  const joinForm = document.getElementById("join-form");
  const usernameInput = document.getElementById("username-input");
  const joinError = document.getElementById("join-error");

  // --- Sohbet elemanları --------------------------------------------------
  const messagesEl = document.getElementById("messages");
  const onlineCountEl = document.getElementById("online-count");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const typingIndicator = document.getElementById("typing-indicator");
  const typingText = document.getElementById("typing-text");

  let myUsername = null;
  let typingTimeout = null;
  const currentlyTyping = new Set();

  // Kullanıcı adına göre tutarlı bir renk üretir (aynı isim = aynı renk)
  const AVATAR_COLORS = ["#FF7A50", "#5EEAD4", "#F7C948", "#9C8CFF", "#FF6B9D", "#63C7FF", "#8CE99A", "#FFA8A8"];
  function colorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "system-msg";
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function addChatMessage({ username, text, time }) {
    const isOwn = username === myUsername;

    const row = document.createElement("div");
    row.className = "msg-row" + (isOwn ? " own" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = colorFor(username);
    avatar.textContent = username.charAt(0).toUpperCase();

    const body = document.createElement("div");
    body.className = "msg-body";

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const nameEl = document.createElement("span");
    nameEl.className = "msg-name";
    nameEl.style.color = colorFor(username);
    nameEl.textContent = isOwn ? "Sen" : username;
    const timeEl = document.createElement("span");
    timeEl.className = "msg-time";
    timeEl.textContent = time || "";
    meta.appendChild(nameEl);
    meta.appendChild(timeEl);

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    body.appendChild(meta);
    body.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(body);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function updateOnlineCount(count) {
    onlineCountEl.textContent = `${count} çevrimiçi`;
  }

  function updateTypingIndicator() {
    if (currentlyTyping.size === 0) {
      typingIndicator.classList.add("hidden");
      return;
    }
    const names = Array.from(currentlyTyping);
    typingText.textContent =
      names.length === 1
        ? `${names[0]} yazıyor...`
        : `${names.join(", ")} yazıyor...`;
    typingIndicator.classList.remove("hidden");
  }

  // --- Kanala katılma -----------------------------------------------------
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = usernameInput.value.trim();
    if (!name) return;
    joinError.classList.add("hidden");
    socket.emit("join", { username: name });
  });

  socket.on("joined", (data) => {
    myUsername = data.username;
    sessionStorage.setItem("frekans_username", myUsername);

    joinScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    messagesEl.innerHTML = "";
    (data.history || []).forEach(addChatMessage);
    updateOnlineCount(data.online_count);
    messageInput.focus();
  });

  socket.on("user_joined", (data) => {
    addSystemMessage(`— ${data.username} kanala katıldı —`);
    updateOnlineCount(data.online_count);
  });

  socket.on("user_left", (data) => {
    addSystemMessage(`— ${data.username} kanaldan ayrıldı —`);
    updateOnlineCount(data.online_count);
    currentlyTyping.delete(data.username);
    updateTypingIndicator();
  });

  // --- Mesajlaşma -----------------------------------------------------------
  socket.on("new_message", (data) => {
    addChatMessage(data);
    currentlyTyping.delete(data.username);
    updateTypingIndicator();
  });

  function sendCurrentMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit("send_message", { text });
    messageInput.value = "";
    socket.emit("stop_typing", {});
    clearTimeout(typingTimeout);
  }

  sendBtn.addEventListener("click", sendCurrentMessage);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendCurrentMessage();
    }
  });

  // --- "Yazıyor..." göstergesi ----------------------------------------------
  messageInput.addEventListener("input", () => {
    socket.emit("typing", {});
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop_typing", {}), 1500);
  });

  socket.on("user_typing", (data) => {
    currentlyTyping.add(data.username);
    updateTypingIndicator();
  });

  socket.on("user_stop_typing", (data) => {
    currentlyTyping.delete(data.username);
    updateTypingIndicator();
  });

  // Tarayıcı sekmesinde daha önce kullanılan ismi hatırla (kolaylık için)
  window.addEventListener("DOMContentLoaded", () => {
    const remembered = sessionStorage.getItem("frekans_username");
    if (remembered) usernameInput.value = remembered;
  });
})();
