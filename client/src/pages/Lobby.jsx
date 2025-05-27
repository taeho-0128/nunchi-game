import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./Lobby.css";

const socket = io("https://nunchi-game-server.onrender.com");

document.title = "🌲 미니 게임 포레스트";

export default function Lobby() {
  const [nickname, setNickname] = useState("");
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState("lobby"); // lobby, waiting, go, result, gamble_result
  const [results, setResults] = useState([]);
  const [canClick, setCanClick] = useState(false);
  const [selectedGame, setSelectedGame] = useState("reaction");
  const [roomList, setRoomList] = useState([]);

  // 추가: 도박 게임 상태
  const [gambleRound, setGambleRound] = useState(0);
  const [gambleResults, setGambleResults] = useState([]);
  const [gambleSelected, setGambleSelected] = useState(null);
  const [gambleTimer, setGambleTimer] = useState(15);
  const gambleTimerRef = useRef(null);

  const createRoom = () => {
    socket.emit("create_room", { nickname }, ({ success, code }) => {
      if (success) {
        setRoomCode(code);
        setIsHost(true);
        setInRoom(true);
      } else {
        alert("방 생성에 실패했습니다.");
      }
    });
  };

  const joinRoom = () => {
    socket.emit("join_room", { code: roomCode, nickname }, ({ success, message }) => {
      if (success) setInRoom(true);
      else alert(message);
    });
  };

  const joinRoomFromList = (code) => {
    setRoomCode(code);
    joinRoom();
  };

  const startGame = () => {
    socket.emit("start_game", { code: roomCode, game: selectedGame });
  };

  const restartGame = () => {
    socket.emit("restart_game", roomCode);
    setGambleRound(0);
    setGambleResults([]);
    setGambleSelected(null);
    setStatus("lobby");
  };

  const clickButton = () => {
    if (!canClick && status === "waiting") {
      socket.emit("click_button", roomCode, true);
    } else if (canClick && status === "go") {
      socket.emit("click_button", roomCode, false);
    }
  };

  // 도박 게임 버튼 선택
  const gambleSelect = (btn) => {
    if (gambleSelected || status !== "gamble_playing") return;
    setGambleSelected(btn);
    socket.emit("gamble_select", { code: roomCode, button: btn });
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
    socket.on("room_list", (list) => setRoomList(list));
    socket.emit("get_room_list");

    // 도박 게임 이벤트
    socket.on("gamble_start_round", ({ round }) => {
      setStatus("gamble_playing");
      setGambleRound(round);
      setGambleSelected(null);
      setGambleResults([]);
      setGambleTimer(15);

      if (gambleTimerRef.current) clearInterval(gambleTimerRef.current);
      gambleTimerRef.current = setInterval(() => {
        setGambleTimer((t) => {
          if (t <= 1) {
            clearInterval(gambleTimerRef.current);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    });

    socket.on("gamble_round_result", ({ round, results }) => {
      setStatus("gamble_round_result");
      setGambleResults(results);
    });

    socket.on("gamble_game_result", (finalResults) => {
      setStatus("gamble_game_result");
      setGambleResults(finalResults);
    });

    return () => {
      if (gambleTimerRef.current) clearInterval(gambleTimerRef.current);
      socket.off("room_update");
      socket.off("game_waiting");
      socket.off("game_go");
      socket.off("game_result");
      socket.off("game_reset");
      socket.off("room_list");
      socket.off("gamble_start_round");
      socket.off("gamble_round_result");
      socket.off("gamble_game_result");
    };
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
          onChange={(e) => setNickname(e.target.value)}
        />
        <button
          onClick={() => {
            if (nickname.trim() === "") alert("닉네임을 입력하세요");
            else setNicknameConfirmed(true);
          }}
        >
          입력 완료
        </button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="container">
        <h1>🌲 미니 게임 포레스트</h1>
        <button onClick={createRoom}>방 만들기</button>
        <input
          placeholder="초대 코드"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
        />
        <button onClick={joinRoom}>입장</button>

        <h3>참여 가능한 방</h3>
        <ul>
          {roomList.map((room) => (
            <li key={room.code}>
              <button onClick={() => joinRoomFromList(room.code)}>
                {room.name} ({room.code}) - 인원: {room.count}명
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // === 게임 화면 ===

  return (
    <div className="container">
      <h1>🌲 미니 게임 포레스트</h1>
      <h3>방 코드: {roomCode}</h3>
      <p>현재 입장한 인원: {users.length}명</p>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>

      {/* 게임 선택 및 시작 (호스트만) */}
      {status === "lobby" && isHost && (
        <>
          <p>게임을 선택해 주세요.</p>
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            style={{ fontSize: "1rem", padding: "0.3rem" }}
          >
            <option value="reaction">반응속도 테스트</option>
            <option value="gamble">눈치 보고 도박하기</option>
          </select>
          <div style={{ marginTop: "0.5rem" }}>
            <button onClick={startGame}>게임 시작</button>
          </div>
        </>
      )}

      {/* 반응속도 테스트 게임 진행중 */}
      {(status === "waiting" || status === "go") && selectedGame === "reaction" && (
        <>
          <p style={{ minHeight: "2em", fontSize: "1rem" }}>
            {status === "waiting" && "곧 버튼을 누르라는 문구가 표시됩니다..."}
            {status === "go" && "버튼을 누르세요!"}
          </p>
          <button onClick={clickButton}>버튼</button>
        </>
      )}

      {/* 반응속도 테스트 결과 */}
      {status === "result" && selectedGame === "reaction" && (
        <div>
          <h4>결과</h4>
          <ol>
            {results.map((r) => (
              <li
                key={r.id}
                className={r.status === "실격" ? "disqualified" : "qualified"}
              >
                {r.name} - {r.status}
                {r.time !== null ? ` (${r.time}ms)` : ""}
              </li>
            ))}
          </ol>
          {isHost && <button onClick={restartGame}>다시 시작</button>}
        </div>
      )}

      {/* 눈치 보고 도박하기 게임 진행 중 */}
      {status === "gamble_playing" && selectedGame === "gamble" && (
        <div>
          <h4>라운드 {gambleRound} / 5</h4>
          <p>15초 안에 버튼 하나를 선택하세요.</p>
          <p>남은 시간: {gambleTimer}초</p>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button disabled={!!gambleSelected} onClick={() => gambleSelect("A")}>
              A버튼: 5원 얻기
            </button>
            <button disabled={!!gambleSelected} onClick={() => gambleSelect("B")}>
              B버튼: 선택한 사람과 나눠 갖기
            </button>
            <button disabled={!!gambleSelected} onClick={() => gambleSelect("C")}>
              C버튼: 혼자 선택 시 5원 얻기 (2명 이상 0원)
            </button>
          </div>
          {gambleSelected && <p>선택 완료: {gambleSelected} 버튼</p>}
        </div>
      )}

      {/* 눈치 보고 도박하기 라운드 결과 */}
      {status === "gamble_round_result" && selectedGame === "gamble" && (
        <div>
          <h4>라운드 {gambleRound} 결과</h4>
          <ol>
            {gambleResults.map((r) => (
              <li key={r.id}>
                {r.name} : {r.score}원
              </li>
            ))}
          </ol>
          <p>잠시 후 다음 라운드가 시작됩니다...</p>
        </div>
      )}

      {/* 눈치 보고 도박하기 최종 결과 */}
      {status === "gamble_game_result" && selectedGame === "gamble" && (
        <div>
          <h4>최종 결과</h4>
          <ol>
            {gambleResults.map((r, i) => (
              <li key={r.id}>
                {i + 1}위 - {r.name} : {r.score}원
              </li>
            ))}
          </ol>
          {isHost && <button onClick={restartGame}>다시 시작</button>}
        </div>
      )}
    </div>
  );
}
