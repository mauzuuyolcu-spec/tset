"""
Frekans - Basit, gercek zamanli mesajlasma sitesi
Flask + Flask-SocketIO kullanir. Veritabani yoktur, her sey bellekte tutulur
(sunucu yeniden baslatilinca mesaj gecmisi silinir).
"""

from datetime import datetime
import random

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "bu-anahtari-kendi-gizli-anahtarinizla-degistirin"

# async_mode='threading' -> ekstra kurulum gerektirmez (eventlet/gevent sart degil)
socketio = SocketIO(app)

# --- Bellekte tutulan veriler ---------------------------------------------
connected_users = {}      # { sid: username }
message_history = []      # son mesajlarin listesi
MAX_HISTORY = 50          # yeni katilan biri en fazla bu kadar eski mesaji gorur


def online_count():
    return len(connected_users)


# --- Sayfa rotasi -----------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# --- Socket.IO olaylari ------------------------------------------------------
@socketio.on("connect")
def handle_connect():
    print(f"Yeni baglanti: {request.sid}")


@socketio.on("disconnect")
def handle_disconnect():
    username = connected_users.pop(request.sid, None)
    if username:
        emit("user_left", {"username": username, "online_count": online_count()}, broadcast=True)
        emit("user_list", {"users": list(connected_users.values())}, broadcast=True)


@socketio.on("join")
def handle_join(data):
    username = (data or {}).get("username", "").strip()[:20]
    if not username:
        username = f"Misafir{random.randint(1000, 9999)}"

    # Ayni isim zaten kullaniliyorsa sonuna numara ekle
    existing = set(connected_users.values())
    original, n = username, 2
    while username in existing:
        username = f"{original}{n}"
        n += 1

    connected_users[request.sid] = username

    # Sadece yeni katilan kisiye: hosgeldin bilgisi + mesaj gecmisi
    emit("joined", {
        "username": username,
        "history": message_history,
        "online_count": online_count(),
    })

    # Digerlerine: birisi katildi bildirimi
    emit("user_joined", {
        "username": username,
        "online_count": online_count(),
    }, broadcast=True, include_self=False)

    emit("user_list", {"users": list(connected_users.values())}, broadcast=True)


@socketio.on("send_message")
def handle_send_message(data):
    username = connected_users.get(request.sid)
    if not username:
        return

    text = (data or {}).get("text", "").strip()[:500]
    if not text:
        return

    message = {
        "username": username,
        "text": text,
        "time": datetime.now().strftime("%H:%M"),
    }
    message_history.append(message)
    if len(message_history) > MAX_HISTORY:
        message_history.pop(0)

    emit("new_message", message, broadcast=True)


@socketio.on("typing")
def handle_typing(_data):
    username = connected_users.get(request.sid)
    if username:
        emit("user_typing", {"username": username}, broadcast=True, include_self=False)


@socketio.on("stop_typing")
def handle_stop_typing(_data):
    username = connected_users.get(request.sid)
    if username:
        emit("user_stop_typing", {"username": username}, broadcast=True, include_self=False)


if __name__ == "__main__":
    # debug=True gelistirme icin faydali (kod degisince otomatik yeniden baslar)
    # allow_unsafe_werkzeug: bu sadece yerel gelistirme/ogrenme amacli bir
    # projedir, gercek bir yayinda (production) bunun yerine gunicorn+eventlet
    # gibi bir sunucu kullanilmalidir.
    socketio.run(app, debug=True, host="127.0.0.1", port=5000, allow_unsafe_werkzeug=True)
