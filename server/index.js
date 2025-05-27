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
    methods: ["GET", "POST"],
  },
});

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_room", ({ nickname }, callback) => {
    console.log("[create_room] 방 생성 요청 받음, 닉네임:", nickname);
    const code = generateRoomCode();
    const roomName = `${nickname}님의 방`;
    rooms[code] = {
      name: roomName,
      host: socket.id,
      users: [{ id: socket.id, name: nickname }],
      started: false,
      results: [],
      readyTime: null,
    };
    socket.join(code);
    console.log("[create_room] 방 생성 완료, 코드:", code);
    callback({ success: true, code });
    io.to(code).emit("room_update", rooms[code].users);
    io.emit("room_list", getRoomList());
  });

  socket.on("join_room", ({ code, nickname }, callback) => {
    console.log(`[join_room] ${nickname} 님이 방 ${code} 입장 요청`);
    const room = rooms[code];
    if (room && !room.started) {
      room.users.push({ id: socket.id, name: nickname });
      socket.join(code);
      console.log(`[join_room] 입장 성공: ${nickname} 님이 방 ${code}에 입장`);
      callback({ success: true });
      io.to(code).emit("room_update", room.users);
    } else {
      console.log(`[join_room] 입장 실패: 방 없음 또는 이미 게임 시작됨 - 코드: ${code}`);
      callback({ success: false, message: "Invalid room code or game already started." });
    }
  });

  socket.on("get_room_list", () => {
    console.log("[get_room_list] 방 목록 요청");
    socket.emit("room_list", getRoomList());
  });

  socket.on("start_game", ({ code, game }) => {
    console.log(`[start_game] 게임 시작 요청 - 방: ${code}, 게임: ${game}`);
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    const delay = Math.floor(Math.random() * 10000) + 1000;
    room.started = true;
    room.results = [];

    io.to(code).emit("game_waiting");
    console.log(`[start_game] 대기 상태 전송 - 방: ${code}, 대기시간: ${delay}ms`);

    setTimeout(() => {
      room.readyTime = Date.now();
      io.to(code).emit("game_go");
      console.log(`[start_game] 게임 시작 신호 전송 - 방: ${code}`);
    }, delay);
  });

  socket.on("click_button", (code) => {
    console.log(`[click_button] 클릭 요청 - 방: ${code}, 소켓: ${socket.id}`);
    const room = rooms[code];
    if (!room || !room.started) {
      console.log("[click_button] 실패: 방 없음 또는 게임 미시작");
      return;
    }

    const alreadyClicked = room.results.find((r) => r.id === socket.id);
    if (alreadyClicked) {
      console.log("[click_button] 이미 클릭한 사용자");
      return;
    }

    const now = Date.now();
    const user = room.users.find((u) => u.id === socket.id);
    const timeDiff = now - (room.readyTime || now);

    if (!room.readyTime) {
      room.results.push({ id: socket.id, name: user.name, status: "실격", time: null });
      console.log(`[click_button] 실격 처리 - 사용자: ${user.name}`);
    } else {
      room.results.push({ id: socket.id, name: user.name, status: "성공", time: timeDiff });
      console.log(`[click_button] 성공 처리 - 사용자: ${user.name}, 시간: ${timeDiff}ms`);
    }

    if (room.results.length === room.users.length) {
      const final = room.results.sort((a, b) => {
        if (a.status === "실격" && b.status !== "실격") return 1;
        if (b.status === "실격" && a.status !== "실격") return -1;
        return a.time - b.time;
      });
      io.to(code).emit("game_result", final);
      room.started = false;
      console.log(`[click_button] 게임 결과 전송 - 방: ${code}`);
    }
  });

  socket.on("restart_game", (code) => {
    console.log(`[restart_game] 게임 재시작 요청 - 방: ${code}`);
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    room.started = false;
    room.results = [];
    room.readyTime = null;
    io.to(code).emit("game_reset");
    console.log(`[restart_game] 게임 초기화 완료 - 방: ${code}`);
  });

  socket.on("disconnecting", () => {
    console.log(`[disconnecting] 소켓 연결 해제 중: ${socket.id}`);
    for (const room of socket.rooms) {
      const r = rooms[room];
      if (r) {
        r.users = r.users.filter((u) => u.id !== socket.id);
        if (r.users.length === 0) {
          delete rooms[room];
          console.log(`[disconnecting] 방 삭제됨: ${room}`);
        } else {
          io.to(room).emit("room_update", r.users);
          console.log(`[disconnecting] 방 인원 업데이트: ${room}`);
        }
      }
    }
    io.emit("room_list", getRoomList());
  });
});

function getRoomList() {
  return Object.entries(rooms).map(([code, room]) => ({
    code,
    name: room.name || "이름 없는 방",
    count: room.users.length,
  }));
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
