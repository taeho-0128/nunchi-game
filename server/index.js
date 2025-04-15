import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_room", (nickname, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      host: socket.id,
      users: [{ id: socket.id, name: nickname }],
      started: false,
      results: [],
      readyTime: null
    };
    socket.join(code);
    callback({ success: true, code });
    io.to(code).emit("room_update", rooms[code].users);
  });

  socket.on("join_room", ({ code, nickname }, callback) => {
    const room = rooms[code];
    if (room && !room.started) {
      room.users.push({ id: socket.id, name: nickname });
      socket.join(code);
      callback({ success: true });
      io.to(code).emit("room_update", room.users);
    } else {
      callback({ success: false, message: "Invalid room code or game already started." });
    }
  });

  socket.on("start_game", (code) => {
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    const delay = Math.floor(Math.random() * 10000) + 1000;
    room.started = true;
    room.results = [];

    io.to(code).emit("game_waiting");

    setTimeout(() => {
      room.readyTime = Date.now();
      io.to(code).emit("game_go");
    }, delay);
  });

  socket.on("click_button", (code) => {
    const room = rooms[code];
    if (!room || !room.started) return;

    const alreadyClicked = room.results.find(r => r.id === socket.id);
    if (alreadyClicked) return;

    const now = Date.now();
    const user = room.users.find(u => u.id === socket.id);
    const timeDiff = now - (room.readyTime || now);

    if (!room.readyTime) {
      room.results.push({ id: socket.id, name: user.name, status: "실격", time: null });
    } else {
      room.results.push({ id: socket.id, name: user.name, status: "성공", time: timeDiff });
    }

    if (room.results.length === room.users.length) {
      const final = room.results.sort((a, b) => {
        if (a.status === "실격" && b.status !== "실격") return 1;
        if (b.status === "실격" && a.status !== "실격") return -1;
        return a.time - b.time;
      });
      io.to(code).emit("game_result", final);
      room.started = false;
    }
  });

  socket.on("restart_game", (code) => {
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    room.started = false;
    room.results = [];
    room.readyTime = null;
    io.to(code).emit("game_reset");
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      const r = rooms[room];
      if (r) {
        r.users = r.users.filter(u => u.id !== socket.id);
        if (r.users.length === 0) delete rooms[room];
        else io.to(room).emit("room_update", r.users);
      }
    }
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
