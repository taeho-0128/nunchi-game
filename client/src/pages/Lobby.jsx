// 서버 (server/index.js)
// ... (기존 서버 코드는 변경 없음)

// 클라이언트 React 예시 (client/src/pages/Lobby.jsx)
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./Lobby.css";

const socket = io("https://nunchi-game-server.onrender.com");

export default function Lobby() {
  const [nickname, setNickname] = useState("");
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState("lobby");
  const [results, setResults] = useState([]);
  const [canClick, setCanClick] = useState(false);
  const [selectedGame, setSelectedGame] = useState("reaction");

  const createRoom = () => {
    socket.emit("create_room", nickname, ({ success, code }) => {
      if (success) {
        setRoomCode(code);
        setInRoom(true);
        setIsHost(true);
      }
    });
  };

  const joinRoom = () => {
    socket.emit("join_room", { code: roomCode, nickname }, ({ success, message }) => {
      if (success) setInRoom(true);
      else alert(message);
    });
  };

  const startGame = () => {
    socket.emit("start_game", { code: roomCode, game: selectedGame });
  };

  const restartGame = () => {
    socket.emit("restart_game", roomCode);
  };

  const clickButton = () => {
    if (!canClick && status === "waiting") {
      socket.emit("click_button", roomCode, true);
    } else if (canClick && status === "go") {
      socket.emit("click_button", roomCode, false);
    }
  };

  useEffect(() => {
    socket.on("room_update", (userList) => setUsers(userList));
    socket.on("game_waiting", () => {
      setStatus("waiting");
      setCanClick(false);
    });
    socket.on("game_go", () => {
      setStatus("go");
      setCanClick(true);
    });
    socket.on("game_result", (data) => {
      setResults(data);
      setStatus("result");
      setCanClick(false);
    });
    socket.on("game_reset", () => {
      setResults([]);
      setStatus("lobby");
      setCanClick(false);
    });
  }, []);

  if (!nicknameConfirmed) {
    return (
      <div className="container">
        <h1>🌲 미니 게임 포레스트</h1>
        <h2>닉네임을 입력하세요</h2>
        <input
          placeholder="닉네임 (최대 20자)"
          value={nickname}
          maxLength={20}
          onChange={e => setNickname(e.target.value)}
        />
        <button onClick={() => {
          if (nickname.trim() === "") alert("닉네임을 입력하세요");
          else setNicknameConfirmed(true);
        }}>입력 완료</button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="container">
        <h1>🌲 미니 게임 포레스트</h1>
        <h2>눈치게임</h2>
        <button onClick={createRoom}>방 만들기</button>
        <input placeholder="초대 코드" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
        <button onClick={joinRoom}>입장</button>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>🌲 미니 게임 포레스트</h1>
      <h3>방 코드: {roomCode}</h3>
      <p>현재 입장한 인원: {users.length}명</p>
      <ul>
        {users.map(u => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>

      {status === "lobby" && isHost && (
        <>
          <p>게임을 선택해 주세요.</p>
          <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)}>
            <option value="reaction">반응속도 테스트</option>
            {/* 다른 게임이 추가되면 아래에 option을 추가 */}
          </select>
          <div style={{ marginTop: '0.5rem' }}>
            <button onClick={startGame}>게임 시작</button>
          </div>
        </>
      )}

      {(status === "waiting" || status === "go") && (
        <>
          <p style={{ minHeight: "2em", fontSize: "1rem" }}>
            {status === "waiting" && "곧 버튼을 누르라는 문구가 표시됩니다..."}
            {status === "go" && "버튼을 누르세요!"}
          </p>
          <button onClick={clickButton}>버튼</button>
        </>
      )}

      {status === "result" && (
        <div>
          <h4>결과</h4>
          <ol>
            {results.map((r, i) => (
              <li key={r.id} className={r.status === "실격" ? "disqualified" : "qualified"}>
                {r.name} - {r.status}{r.time !== null ? ` (${r.time}ms)` : ""}
              </li>
            ))}
          </ol>
          {isHost && <button onClick={restartGame}>다시 시작</button>}
        </div>
      )}
    </div>
  );
}
