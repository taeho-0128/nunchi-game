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
    socket.emit("start_game", roomCode);
  };

  const restartGame = () => {
    socket.emit("restart_game", roomCode);
  };

  const clickButton = () => {
    if (!canClick && status === "waiting") {
      socket.emit("click_button", roomCode, true); // 조기 클릭
    } else if (canClick && status === "go") {
      socket.emit("click_button", roomCode, false); // 정상 클릭
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
        <h2>눈치게임</h2>
        <button onClick={createRoom}>방 만들기</button>
        <input placeholder="초대 코드" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
        <button onClick={joinRoom}>입장</button>
      </div>
    );
  }

  return (
    <div className="container">
      <h3>방 코드: {roomCode}</h3>
      <p>현재 입장한 인원: {users.length}명</p>
      <ul>
        {users.map(u => (
          <li key={u.id}>
            {u.name}
            {status === "lobby" && <span className="userid"> (ID: {u.id})</span>}
          </li>
        ))}
      </ul>

      {status === "lobby" && isHost && <button onClick={startGame}>게임 시작</button>}
      {status === "waiting" && <p>곧 버튼을 누르라는 문구가 표시됩니다...</p>}
      {(status === "waiting" || status === "go") && (
        <button onClick={clickButton}>버튼 누르기</button>
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
