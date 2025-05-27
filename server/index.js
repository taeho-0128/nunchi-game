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

  socket.on("create_room", ({ nickname, roomName }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      name: roomName,
      host: socket.id,
      users: [{ id: socket.id, name: nickname }],
      started: false,
      results: [],
      readyTime: null,
      game: null,  // 현재 진행 중인 게임 이름
      gameData: null // 게임별 데이터 저장
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

  socket.on("get_room_list", () => {
    const list = Object.entries(rooms).map(([code, room]) => ({
      code,
      name: room.name || "이름 없는 방",
      count: room.users.length
    }));
    socket.emit("room_list", list);
  });

  socket.on("start_game", ({ code, game }) => {
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    room.started = true;
    room.game = game;
    room.results = [];
    room.gameData = null;

    if (game === "reaction") {
      const delay = Math.floor(Math.random() * 10000) + 1000;
      io.to(code).emit("game_waiting");

      setTimeout(() => {
        room.readyTime = Date.now();
        io.to(code).emit("game_go");
      }, delay);

    } else if (game === "gamble") {
      // 눈치 보고 도박하기 초기화
      room.round = 1;
      room.gameData = {
        scores: {}, // { userId: 총점 }
        currentChoices: {}, // 현재 라운드 선택 기록 { userId: 선택한 버튼 ('A', 'B', 'C') }
      };
      io.to(code).emit("gamble_start", { round: room.round });
      startGambleRound(code);
    }
  });

  socket.on("gamble_choice", ({ code, choice }) => {
    const room = rooms[code];
    if (!room || !room.started || room.game !== "gamble") return;

    room.gameData.currentChoices[socket.id] = choice;

    // 모두 선택했는지 확인
    if (Object.keys(room.gameData.currentChoices).length === room.users.length) {
      // 점수 계산
      calculateGambleRound(room);

      if (room.round >= 5) {
        // 5라운드 종료, 결과 전송
        const finalResults = room.users.map(u => ({
          id: u.id,
          name: u.name,
          score: room.gameData.scores[u.id] || 0
        })).sort((a, b) => b.score - a.score);

        io.to(code).emit("game_result", finalResults);
        room.started = false;
      } else {
        // 다음 라운드 시작
        room.round++;
        room.gameData.currentChoices = {};
        io.to(code).emit("gamble_next_round", { round: room.round });
        startGambleRound(code);
      }
    }
  });

  socket.on("restart_game", (code) => {
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    room.started = false;
    room.results = [];
    room.readyTime = null;
    room.game = null;
    room.gameData = null;

    io.to(code).emit("game_reset");
  });

  socket.on("click_button", (code) => {
    const room = rooms[code];
    if (!room || !room.started || room.game !== "reaction") return;

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

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      const r = rooms[room];
      if (r) {
        r.users = r.users.filter(u => u.id !== socket.id);
        if (r.users.length === 0) {
          delete rooms[room];
        } else {
          io.to(room).emit("room_update", r.users);
        }
      }
    }
  });
});

// 눈치 보고 도박하기 1라운드 시작 함수
function startGambleRound(code) {
  const room = rooms[code];
  if (!room) return;

  io.to(code).emit("gamble_round_start", { round: room.round });

  // 15초 후에 라운드 결과 처리
  setTimeout(() => {
    processGambleRound(code);
  }, 15000);
}

// 눈치 보고 도박하기 라운드 결과 처리
function processGambleRound(code) {
  const room = rooms[code];
  if (!room) return;

  const choices = room.gameData.currentChoices;
  const scores = room.gameData.scores || {};

  // 선택하지 않은 사람은 0점 처리
  room.users.forEach(u => {
    if (!choices[u.id]) {
      choices[u.id] = null;
      scores[u.id] = scores[u.id] || 0;
    }
  });

  // 버튼별 인원수 카운트
  const countA = Object.values(choices).filter(c => c === "A").length;
  const countB = Object.values(choices).filter(c => c === "B").length;
  const countC = Object.values(choices).filter(c => c === "C").length;

  // A버튼은 고정 5점
  // B버튼은 A × floor(참가자 수 ÷ 2)
  // C버튼은 혼자 선택시 A버튼 점수의 2배, 2명 이상이면 0점

  const nA = 5;
  const nB = nA * Math.floor(room.users.length / 2);

  // B 버튼 점수 총합 (B버튼 선택한 플레이어 수 * nB)
  const totalB = nB * countB;

  // 점수 계산
  room.users.forEach(u => {
    const choice = choices[u.id];
    if (choice === "A") {
      scores[u.id] = (scores[u.id] || 0) + nA;
    } else if (choice === "B") {
      // B 점수는 나눠갖기
      if (countB > 0) {
        scores[u.id] = (scores[u.id] || 0) + totalB / countB;
      }
    } else if (choice === "C") {
      if (countC === 1) {
        scores[u.id] = (scores[u.id] || 0) + nA * 2;
      } else {
        scores[u.id] = scores[u.id] || 0;
      }
    } else {
      // 선택 안함 0점
      scores[u.id] = scores[u.id] || 0;
    }
  });

  room.gameData.scores = scores;

  // 점수 최신화해서 클라이언트에 보내기
  io.to(code).emit("gamble_scores", scores);
}

server.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));
