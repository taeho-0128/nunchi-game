import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./Lobby.css";

const socket = io("https://nunchi-game-server.onrender.com");

document.title = "🌲 미니 게임 포레스트";

export default function Lobby() {
  const [socketId, setSocketId] = useState(null);

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
  const [roomList, setRoomList] = useState([]);
  const [round, setRound] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedButton, setSelectedButton] = useState(null);
  const [totalCoins, setTotalCoins] = useState(0);
  const [lastCoins, setLastCoins] = useState(0);

  const timerRef = useRef(null);

  const createRoom = () => {
    const generatedRoomName = `${nickname}님의 방`;
    socket.emit(
      "create_room",
      { nickname, roomName: generatedRoomName },
      ({ success, code }) => {
        if (success) {
          setRoomCode(code);
          setIsHost(true);
          setInRoom(true);
        } else {
          alert("방 생성에 실패했습니다.");
        }
      }
    );
  };

  const joinRoom = () => {
    socket.emit(
      "join_room",
      { code: roomCode, nickname },
      ({ success, message }) => {
        if (success) setInRoom(true);
        else alert(message);
      }
    );
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
    setSelectedButton(null);
    setRound(0);
    setLastCoins(0);
    setTotalCoins(0);
    setStatus("lobby");
    setResults([]);
    setCanClick(false);
    setTimeLeft(15);
    clearInterval(timerRef.current);
  };

  const clickButton = (button) => {
    if (!canClick) return;
    if (selectedButton) return;
    setSelectedButton(button);
    if (selectedGame === "reaction") {
      socket.emit("click_button", roomCode);
    } else if (selectedGame === "gamble") {
      socket.emit("gamble_choice", { code: roomCode, choice: button });
    }
  };

  useEffect(() => {
    if ((status === "waiting" || status === "go") && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0 && canClick) {
      setCanClick(false);
      setSelectedButton(null);
    }
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, status, canClick]);

  useEffect(() => {
    socket.on("connect", () => {
      setSocketId(socket.id);
    });

    socket.on("room_update", (userList) => setUsers(userList));

    // 반응속도 테스트 이벤트
    socket.on("game_waiting", () => {
      if (selectedGame !== "reaction") return;
      setStatus("waiting");
      setCanClick(false);
      setTimeLeft(15);
      setSelectedButton(null);
    });

    socket.on("game_go", () => {
      if (selectedGame !== "reaction") return;
      setStatus("go");
      setCanClick(true);
    });

    socket.on("game_result", (data) => {
      if (selectedGame !== "reaction") return;
      setResults(data);
      setStatus("result");
      setCanClick(false);
    });

    // 눈치보고 도박하기 이벤트
    socket.on("gamble_start", ({ round }) => {
      if (selectedGame !== "gamble") return;
      setRound(round);
      setStatus("waiting");
      setCanClick(false);
      setTimeLeft(15);
      setSelectedButton(null);
    });

    socket.on("gamble_round_start", ({ round }) => {
      if (selectedGame !== "gamble") return;
      setRound(round);
      setStatus("waiting");
      setCanClick(false);
      setTimeLeft(15);
      setSelectedButton(null);
    });

    socket.on("gamble_next_round", ({ round }) => {
      if (selectedGame !== "gamble") return;
      setRound(round);
      setStatus("waiting");
      setCanClick(false);
      setTimeLeft(15);
      setSelectedButton(null);
    });

    socket.on("gamble_scores", (scores) => {
      if (selectedGame !== "gamble") return;
      setResults(
        Object.entries(scores).map(([id, score]) => {
          const user = users.find((u) => u.id === id);
          return {
            id,
            name: user ? user.name : "알 수 없음",
            score,
          };
        })
      );
    });

    socket.on("game_result", (data) => {
      if (selectedGame !== "gamble") return;
      setResults(data);
      setStatus("result");
      setCanClick(false);
    });

    socket.on("game_reset", () => {
      setResults([]);
      setStatus("lobby");
      setCanClick(false);
      setRound(0);
      setSelectedButton(null);
      setLastCoins(0);
      setTotalCoins(0);
      setTimeLeft(15);
      clearTimeout(timerRef.current);
    });

    socket.on("room_list", (list) => setRoomList(list));

    socket.emit("get_room_list");

    return () => {
      socket.off("connect");
      socket.off("room_update");
      socket.off("game_waiting");
      socket.off("game_go");
      socket.off("game_result");
      socket.off("gamble_start");
      socket.off("gamble_round_start");
      socket.off("gamble_next_round");
      socket.off("gamble_scores");
      socket.off("game_reset");
      socket.off("room_list");
      clearTimeout(timerRef.current);
    };
  }, [selectedGame, users]);

  // 눈치보고 도박하기 라운드 자동 진행 (클라이언트 타이밍 맞추기)
  useEffect(() => {
    if (status === "result" && selectedGame === "gamble" && round < 5) {
      const timeout = setTimeout(() => {
        socket.emit("next_round", roomCode);
        setStatus("waiting");
        setCanClick(false);
        setTimeLeft(15);
        setSelectedButton(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [round, roomCode, status, selectedGame]);

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

  return (
    <div className="container">
      <h1>🌲 미니 게임 포레스트</h1>
      {status !== "lobby" && status !== "result" && (
        <h2>
          현재 진행중인 게임:{" "}
          {selectedGame === "reaction"
            ? "반응속도 테스트"
            : "눈치 보고 도박하기"}
        </h2>
      )}
      <h3>방 코드: {roomCode}</h3>
      <p>현재 입장한 인원: {users.length}명</p>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.name}{" "}
            {results.find((r) => r.id === u.id)
              ? `- 이번 라운드 획득: ${
                  results.find((r) => r.id === u.id).roundCoins || 0
                }원`
              : ""}
          </li>
        ))}
      </ul>

      {/* 반응속도 테스트 UI */}
      {(status === "waiting" || status === "go") &&
        selectedGame === "reaction" && (
          <>
            <p style={{ minHeight: "2em", fontSize: "1rem" }}>
              {status === "waiting" && "곧 버튼을 누르라는 문구가 표시됩니다..."}
              {status === "go" && "버튼을 누르세요!"}
            </p>
            <button onClick={() => clickButton(null)}>버튼</button>
          </>
        )}

      {/* 눈치보고 도박하기 UI */}
      {(status === "waiting" || status === "go") &&
        selectedGame === "gamble" && (
          <>
            <p>라운드 {round} / 5</p>
            <p>15초 안에 버튼 하나를 선택하세요.</p>
            <p>남은 시간: {timeLeft}초</p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "1rem",
              }}
            >
              <button
                disabled={!canClick || selectedButton !== null}
                onClick={() => clickButton("A")}
              >
                5원 얻기
              </button>
              <button
                disabled={!canClick || selectedButton !== null}
                onClick={() => clickButton("B")}
              >
                선택한 사람과 {Math.floor(users.length / 2) * 5}원 나눠 갖기
              </button>
              <button
                disabled={!canClick || selectedButton !== null}
                onClick={() => clickButton("C")}
              >
                혼자 선택 시 10원 얻기 (2명 이상 0원)
              </button>
            </div>
            {selectedButton && <p>선택 완료: {selectedButton} 버튼</p>}
          </>
        )}

      {status === "result" && (
        <div>
          <h4>결과</h4>
          <ol>
            {results.map((r) => (
              <li
                key={r.id}
                className={r.status === "실격" ? "disqualified" : "qualified"}
              >
                {r.name} -{" "}
                {selectedGame === "reaction"
                  ? `${r.status} ${r.time !== null ? `(${r.time}ms)` : ""}`
                  : `총점: ${r.score || 0}원`}
              </li>
            ))}
          </ol>
          {isHost && <button onClick={restartGame}>다시 시작</button>}
        </div>
      )}

      {/* 게임 선택 및 시작 (방장만) */}
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
    </div>
  );
}
