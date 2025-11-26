import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import QRCode from 'react-qr-code';

const socket = io('http://10.163.48.101:3001');


const POINT_VALUES = [200, 400, 600, 800, 1000];

export default function App() {
  const [screen, setScreen] = useState('setup');
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [highlightedPlayerIndex, setHighlightedPlayerIndex] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [categories, setCategories] = useState(['', '', '', '', '']);
  const [questions, setQuestions] = useState(
    POINT_VALUES.map(() => Array(5).fill(null).map(() => ({ 
      question: '', 
      answer: '', 
      imageUrl: null 
    })))
  );
  const [finalJeopardy, setFinalJeopardy] = useState({
    category: '',
    question: '',
    answer: '',
    imageUrl: null
  });
  const [players, setPlayers] = useState([]);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [answeredQuestions, setAnsweredQuestions] = useState(new Set());
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [lockedPlayers, setLockedPlayers] = useState(new Set());
  const [uploadedImages, setUploadedImages] = useState([]);
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [finalJeopardyPhase, setFinalJeopardyPhase] = useState(null); 
  const [playerWagers, setPlayerWagers] = useState({}); 
  const [playerAnswers, setPlayerAnswers] = useState({});
  const [playersReady, setPlayersReady] = useState(new Set());
  const [correctPlayers, setCorrectPlayers] = useState(new Set()); 
  const [revealedCount, setRevealedCount] = useState(0);
  const [correctVideos] = useState([
    '/videos/correct/Holy.mp4',
    '/videos/correct/yippee.mp4',
    '/videos/correct/cong.mp4',
    '/videos/correct/wait.mp4',
    '/videos/correct/woo.mp4'
  ]);
  const [wrongVideos] = useState([
    '/videos/wrong/cat.mp4',
    '/videos/wrong/eww.mp4',
    '/videos/wrong/tarik.mp4',
    '/videos/wrong/upin.mp4',
    '/videos/wrong/frog.mp4'
  ]);

   const playAudioFile = (soundName, volume = 0.8) => {
  try {
    const audio = new Audio(`/sounds/${soundName}.mp3`);
    audio.volume = volume;
    audio.play().catch(err => console.log('Audio play failed:', err));
    return audio;
  } catch (error) {
    console.log('Audio error:', error);
    return null;
  }
};

  useEffect(() => {
    socket.on('players-update', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('player-buzzed', (playerId) => {
      // Only allow buzz if player is not locked out
      if (!lockedPlayers.has(playerId)) {
        setBuzzedPlayerId(playerId);
        playSound('buzz');
      }
    });

    socket.on('buzzer-reset', () => {
      setBuzzedPlayerId(null);
    });
    socket.on('wager-submitted', ({ playerId, wager }) => {
    setPlayerWagers(prev => ({ ...prev, [playerId]: wager }));
    setPlayersReady(prev => new Set([...prev, playerId]));
    });

    socket.on('final-answer-submitted', ({ playerId, answer }) => {
    setPlayerAnswers(prev => ({ ...prev, [playerId]: answer }));
    setPlayersReady(prev => new Set([...prev, playerId]));
    });

    

    return () => {
      socket.off('players-update');
      socket.off('player-buzzed');
      socket.off('buzzer-reset');
      socket.off('wager-submitted');
      socket.off('final-answer-submitted');
    };
  }, [lockedPlayers]);

  // Detect when all 25 questions are answered
useEffect(() => {
  if (answeredQuestions.size === 25 && !finalJeopardyPhase && screen === 'game') {
    console.log('🏆 All questions answered! Starting Final Jeopardy...');
    // Show transition screen
    setTimeout(() => {
      setFinalJeopardyPhase('transition');
    }, 1000);
    
    // Then show category after dramatic pause
    setTimeout(() => {
      setFinalJeopardyPhase('category');
    }, 4500);
  }
}, [answeredQuestions, finalJeopardyPhase, screen]);

useEffect(() => {
  if (finalJeopardyPhase === 'results' && revealedCount >= players.length && players.length > 0) {
    playAudioFile('finalAPP', 0.7);
  }
}, [finalJeopardyPhase, revealedCount, players.length]);


  const startPlayerSelection = () => {
  console.log('🎲 Starting player selection!');
  console.log('Players:', players);
  
  setScreen('player-selection');
  setIsSelecting(true);
  setHighlightedPlayerIndex(0); // Start at first player
  
  let currentIndex = 0;
  let iterations = 0;
  const maxIterations = 20;

  const animate = () => {
    console.log(`Iteration ${iterations}, highlighting player ${currentIndex}`);
    
    // Move to next player
    currentIndex = (currentIndex + 1) % players.length;
    setHighlightedPlayerIndex(currentIndex);
    iterations++;

    // Calculate speed - starts fast, gets slower
    let speed = 100;
    if (iterations > 10) {
      speed = 100 + (iterations - 10) * 80;
    }

    if (iterations >= maxIterations) {
      console.log('🎯 Selection complete! Winner:', players[currentIndex].name);
      // Animation complete
      setIsSelecting(false);
      setActivePlayerId(players[currentIndex].id);
      
      setTimeout(() => {
        console.log('Transitioning to game...');
        setScreen('game');
      }, 1500);
    } else {
      // Continue animation
      setTimeout(animate, speed);
    }
  };

  // Start after a small delay to ensure screen has transitioned
  setTimeout(() => {
    console.log('Starting animation loop...');
    animate();
  }, 300);
};

  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  };

  const goToWaitingRoom = () => {
    if (validateSetup()) {
      const newRoomCode = generateRoomCode();
      setRoomCode(newRoomCode);
      socket.emit('create-room', newRoomCode);
      setScreen('waiting');
    }
  };

  const updateQuestion = (pointIndex, catIndex, field, value) => {
    const newQuestions = [...questions];
    newQuestions[pointIndex][catIndex][field] = value;
    setQuestions(newQuestions);
  };

  const handleImageUpload = (pointIndex, catIndex, event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file);
      setUploadedImages([...uploadedImages, imageUrl]);
      updateQuestion(pointIndex, catIndex, 'imageUrl', imageUrl);
    }
  };

  const handleFinalJeopardyImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file);
      setUploadedImages([...uploadedImages, imageUrl]);
      setFinalJeopardy({ ...finalJeopardy, imageUrl });
    }
  };

  const removeImage = (pointIndex, catIndex) => {
    updateQuestion(pointIndex, catIndex, 'imageUrl', null);
  };

  const removeFinalJeopardyImage = () => {
    setFinalJeopardy({ ...finalJeopardy, imageUrl: null });
  };

  const cleanupImages = () => {
    uploadedImages.forEach(url => URL.revokeObjectURL(url));
    setUploadedImages([]);
  };

  const validateSetup = () => {
    if (categories.some(cat => !cat.trim())) {
      alert('Please fill in all 5 categories!');
      return false;
    }
    
    for (let i = 0; i < questions.length; i++) {
      for (let j = 0; j < questions[i].length; j++) {
        const q = questions[i][j];
        if ((!q.question.trim() && !q.imageUrl) || !q.answer.trim()) {
          alert(`Please fill in all questions and answers!\nMissing: Category ${j + 1}, ${POINT_VALUES[i]} points`);
          return false;
        }
      }
    }

    if (!finalJeopardy.category.trim() || (!finalJeopardy.question.trim() && !finalJeopardy.imageUrl) || !finalJeopardy.answer.trim()) {
      alert('Please fill in the Final Jeopardy question completely!');
      return false;
    }
    
    return true;
  };

   const updateCategory = (index, value) => {
    const newCategories = [...categories];
    newCategories[index] = value;
    setCategories(newCategories);
  };

  const startGame = () => {
    if (players.length >= 2) {
      setScreen('game');
      socket.emit('start-game');
    } else {
      alert('Need at least 2 players to start!');
    }
  };

  const fullReset = () => {
    socket.emit('full-reset');
    setBuzzedPlayerId(null);
    setLockedPlayers(new Set());
  };
  const clearBuzzWinner = () => {
    socket.emit('clear-buzz-only');
    setBuzzedPlayerId(null);

};

  const openQuestion = (pointIndex, catIndex) => {
    const questionKey = `${pointIndex}-${catIndex}`;
    if (answeredQuestions.has(questionKey)) return;
    
    setCurrentQuestion({
      pointIndex,
      catIndex,
      points: POINT_VALUES[pointIndex],
      category: categories[catIndex],
      question: questions[pointIndex][catIndex].question,
      answer: questions[pointIndex][catIndex].answer,
      imageUrl: questions[pointIndex][catIndex].imageUrl,
      key: questionKey
    });
    setShowAnswer(false);
    setAnsweredCorrectly(false);
    setLockedPlayers(new Set());
    fullReset();
  };

  const closeQuestion = () => {
    if (currentQuestion) {
      setAnsweredQuestions(new Set([...answeredQuestions, currentQuestion.key]));
    }
    setCurrentQuestion(null);
    setShowAnswer(false);
    setAnsweredCorrectly(false);
    setLockedPlayers(new Set());
    setPlayingVideo(null);
    fullReset();
  };

  const updatePlayerScore = (playerId, pointChange) => {
    const updatedPlayers = players.map(p => 
      p.id === playerId ? { ...p, score: p.score + pointChange } : p
    );
    setPlayers(updatedPlayers);
    socket.emit('update-scores', updatedPlayers);
  };

  const playSound = (type) => {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      if (type === 'buzz') {
        oscillator.frequency.value = 400;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.2);
      } else if (type === 'correct') {
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.5);
      } else if (type === 'wrong') {
        oscillator.frequency.value = 200;
        oscillator.type = 'sawtooth';
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.4);
      }
    } catch (error) {
      console.log('Audio context error:', error);
    }
  };

  const getRandomVideo = (videoArray) => {
    return videoArray[Math.floor(Math.random() * videoArray.length)];
  };

  const handleCorrect = () => {
    if (buzzedPlayerId && currentQuestion && !answeredCorrectly) {
      updatePlayerScore(buzzedPlayerId, currentQuestion.points);
      setShowAnswer(true);
      setAnsweredCorrectly(true);
      playSound('correct');

      setActivePlayerId(buzzedPlayerId);
      
      const video = getRandomVideo(correctVideos);
      setPlayingVideo({ url: video, type: 'correct' });
      setTimeout(() => setPlayingVideo(null), 5000);
    }
  };

  const handleWrong = () => {
    if (buzzedPlayerId && currentQuestion && !answeredCorrectly) {
      updatePlayerScore(buzzedPlayerId, -currentQuestion.points);
      setLockedPlayers(new Set([...lockedPlayers, buzzedPlayerId]));
      socket.emit('lock-player', buzzedPlayerId);
      playSound('wrong');
      
      const video = getRandomVideo(wrongVideos);
      setPlayingVideo({ url: video, type: 'wrong' });
      setTimeout(() => setPlayingVideo(null), 5000);
      
      clearBuzzWinner();
    }
  };

  const toggleShowAnswer = () => {
    setShowAnswer(!showAnswer);
  };

  // Final Jeopardy phase transitions
const startWagering = () => {
  setFinalJeopardyPhase('wagering');
  setPlayersReady(new Set());
  socket.emit('start-final-wagering', roomCode);
};

const startFinalQuestion = () => {
  setFinalJeopardyPhase('question');
  setPlayersReady(new Set());
   playAudioFile('finalJP', 0.3);
  socket.emit('start-final-question', roomCode);
};

const reviewAnswers = () => {
  setFinalJeopardyPhase('review');
};

const toggleCorrectPlayer = (playerId) => {
  setCorrectPlayers(prev => {
    const newSet = new Set(prev);
    if (newSet.has(playerId)) {
      newSet.delete(playerId);
    } else {
      newSet.add(playerId);
    }
    return newSet;
  });
};

const calculateFinalResults = () => {
  const updatedPlayers = players.map(player => {
    const wager = playerWagers[player.id] || 0;
    const isCorrect = correctPlayers.has(player.id);
    const scoreChange = isCorrect ? wager : -wager;
    return { ...player, score: player.score + scoreChange };
  });
  
  setPlayers(updatedPlayers);
  socket.emit('update-scores', updatedPlayers);
  setFinalJeopardyPhase('results');
  setRevealedCount(0); 
  
  startSequentialReveal(updatedPlayers.length);
};

const playAgain = () => {
  // Reset game state but keep questions
  setScreen('waiting');
  setFinalJeopardyPhase(null);
  setAnsweredQuestions(new Set());
  setCurrentQuestion(null);
  setBuzzedPlayerId(null);
  setLockedPlayers(new Set());
  setActivePlayerId(null);
  setPlayerWagers({});
  setPlayerAnswers({});
  setPlayersReady(new Set());
  setCorrectPlayers(new Set());
  setRevealedCount(0);

  const resetPlayers = players.map(p => ({ ...p, score: 0 }));
  setPlayers(resetPlayers);
  socket.emit('update-scores', resetPlayers);
  
  const newRoomCode = generateRoomCode();
  setRoomCode(newRoomCode);
  socket.emit('create-room', newRoomCode);
};

const newGame = () => {
  window.location.reload();
};


  const startSequentialReveal = (totalplayers) => {
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setRevealedCount(count);

      if (count >=totalplayers) {
        clearInterval(interval);
      }
    },2000);
  };


  const buzzerUrl = `http://10.163.48.101:8080?room=${roomCode}`;

  // SETUP SCREEN
  if (screen === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-6xl font-black text-yellow-400 mb-2" style={{ textShadow: '0 0 20px rgba(255,215,0,0.5)' }}>
              Game Setup
            </h1>
            <p className="text-white text-xl">Create your Jeopardy board</p>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 mb-6 shadow-2xl">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <span className="text-4xl">📚</span>
              Categories
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {categories.map((cat, index) => (
                <div key={index}>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Category {index + 1}
                  </label>
                  <input
                    type="text"
                    value={cat}
                    onChange={(e) => updateCategory(index, e.target.value)}
                    placeholder={`Category ${index + 1}`}
                    className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold"
                    maxLength={20}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 mb-6 shadow-2xl">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <span className="text-4xl">❓</span>
              Questions & Answers
            </h2>
            <p className="text-gray-600 mb-4 text-sm">You can add text questions, image questions, or both!</p>
            
            <div className="space-y-6">
              {POINT_VALUES.map((points, pointIndex) => (
                <div key={points} className="border-2 border-gray-200 rounded-2xl p-6 bg-gradient-to-r from-blue-50 to-purple-50">
                  <h3 className="text-2xl font-bold text-blue-600 mb-4">{points} Points</h3>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {categories.map((cat, catIndex) => (
                      <div key={catIndex} className="bg-white p-4 rounded-xl shadow-md">
                        <p className="font-bold text-gray-600 mb-2 text-sm truncate">
                          {cat || `Category ${catIndex + 1}`}
                        </p>
                        
                        {questions[pointIndex][catIndex].imageUrl ? (
                          <div className="mb-2 relative">
                            <img 
                              src={questions[pointIndex][catIndex].imageUrl} 
                              alt="Question" 
                              className="w-full h-32 object-cover rounded-lg"
                            />
                            <button
                              onClick={() => removeImage(pointIndex, catIndex)}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs hover:bg-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <label className="block mb-2">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-blue-500 transition">
                              <span className="text-2xl">🖼️</span>
                              <p className="text-xs text-gray-500">Add Image</p>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(pointIndex, catIndex, e)}
                              className="hidden"
                            />
                          </label>
                        )}

                        <textarea
                          placeholder="Question (optional if image)"
                          value={questions[pointIndex][catIndex].question}
                          onChange={(e) => updateQuestion(pointIndex, catIndex, 'question', e.target.value)}
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg mb-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                          rows={2}
                        />
                        <input
                          type="text"
                          placeholder="Answer *"
                          value={questions[pointIndex][catIndex].answer}
                          onChange={(e) => updateQuestion(pointIndex, catIndex, 'answer', e.target.value)}
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-green-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-100 to-orange-100 rounded-3xl p-8 mb-6 shadow-2xl border-4 border-yellow-400">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <span className="text-4xl">🏆</span>
              Final Jeopardy
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Category *
                </label>
                <input
                  type="text"
                  value={finalJeopardy.category}
                  onChange={(e) => setFinalJeopardy({ ...finalJeopardy, category: e.target.value })}
                  placeholder="Final Jeopardy Category"
                  className="w-full px-4 py-3 border-2 border-yellow-400 rounded-xl focus:border-yellow-600 focus:outline-none text-lg font-semibold"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Question/Image *
                </label>
                {finalJeopardy.imageUrl ? (
                  <div className="relative">
                    <img 
                      src={finalJeopardy.imageUrl} 
                      alt="Final Jeopardy" 
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      onClick={removeFinalJeopardyImage}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-yellow-400 rounded-lg p-6 text-center cursor-pointer hover:border-yellow-600 transition">
                      <span className="text-3xl">🖼️</span>
                      <p className="text-xs text-gray-600">Add Image</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFinalJeopardyImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
                <textarea
                  placeholder="Question text (optional if image)"
                  value={finalJeopardy.question}
                  onChange={(e) => setFinalJeopardy({ ...finalJeopardy, question: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-yellow-400 rounded-xl focus:border-yellow-600 focus:outline-none text-lg mt-2"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Answer *
                </label>
                <input
                  type="text"
                  value={finalJeopardy.answer}
                  onChange={(e) => setFinalJeopardy({ ...finalJeopardy, answer: e.target.value })}
                  placeholder="Final Jeopardy Answer"
                  className="w-full px-4 py-3 border-2 border-yellow-400 rounded-xl focus:border-yellow-600 focus:outline-none text-lg font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <button
              onClick={goToWaitingRoom}
              className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white px-16 py-5 rounded-2xl text-3xl font-black shadow-2xl hover:shadow-green-500/50 transition-all transform hover:scale-105"
            >
              Continue to Waiting Room →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // WAITING ROOM
  if (screen === 'waiting') {
    return (
      <div className="min-h-screen relative overflow-hidden" style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)'
      }}>
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-300 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto p-8">
          <div className="text-center mb-12">
            <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 mb-2" 
                style={{ 
                  textShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
                  WebkitTextStroke: '2px rgba(255, 215, 0, 0.3)'
                }}>
              JEOPARDY!
            </h1>
            <h2 className="text-4xl text-white font-bold mb-2">Waiting Room</h2>
            <div className="inline-block bg-white/20 backdrop-blur-sm px-6 py-3 rounded-full">
              <p className="text-2xl text-white font-semibold">
                {players.length} / 6 players joined
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border-4 border-white/50">
              <h3 className="text-3xl font-bold text-gray-800 mb-8 text-center flex items-center justify-center gap-3">
                <span className="text-4xl">👥</span>
                Players Ready
              </h3>
              
              {players.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-8xl mb-6 animate-bounce">🎮</div>
                  <p className="text-gray-500 text-xl font-medium">
                    Waiting for players to join...
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-5 bg-gradient-to-r from-purple-50 to-blue-50 p-5 rounded-2xl border-2 border-purple-200 shadow-md"
                    >
                      <div className="text-6xl bg-white rounded-full p-3 shadow-md">{player.icon}</div>
                      <div className="flex-1">
                        <h4 className="text-2xl font-bold text-gray-800">{player.name}</h4>
                        <p className="text-sm text-purple-600 font-semibold">Ready to play! 🎯</p>
                      </div>
                      <div className="text-green-500 text-4xl animate-pulse">✓</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border-4 border-white/50">
              <h3 className="text-3xl font-bold text-gray-800 mb-8 text-center flex items-center justify-center gap-3">
                <span className="text-4xl">📱</span>
                Join the Game
              </h3>
              
              <div className="text-center">
                <p className="text-xl text-gray-700 mb-6 font-medium">
                  Scan this QR code with your phone:
                </p>
                
                <div className="bg-gradient-to-br from-purple-100 to-blue-100 w-72 h-72 mx-auto rounded-3xl flex items-center justify-center mb-8 border-4 border-purple-300 shadow-xl">
                    <QRCode
                       value={`http://10.163.48.101:8080?room=${roomCode}`}
                       size={256}
                       level="H"
                   />
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-5 rounded-2xl mb-6 border-2 border-blue-200">
                  <p className="text-sm text-gray-600 mb-2 font-semibold">Or visit on your phone:</p>
                  <code className="text-blue-600 font-mono text-lg break-all font-bold">
                    {buzzerUrl}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-10">
            <button
            onClick={startPlayerSelection}
            disabled={players.length < 2}
            className={`px-16 py-5 text-3xl font-black rounded-2xl shadow-2xl transition-all transform ${
              players.length >= 2
                ? 'bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white cursor-pointer hover:scale-105'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            {players.length < 2 ? '⏳ Need 2+ Players' : '🚀 START GAME'}
          </button>
          </div>
        </div>
      </div>
    );
  }

  // PLAYER SELECTION SCREEN
if (screen === 'player-selection') {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-center mb-4 text-white">
          {isSelecting ? 'Selecting First Player...' : 'First Player Selected!'}
        </h1>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-12">
          {players.map((player, index) => (
            <div
              key={player.id}
              className={`p-8 rounded-xl transition-all duration-300 transform ${
                highlightedPlayerIndex === index
                  ? 'bg-yellow-400 scale-110 shadow-2xl ring-8 ring-yellow-300 animate-pulse'
                  : 'bg-white/10 scale-100'
              }`}
            >
              <div className="text-6xl text-center mb-4">{player.icon}</div>
              <div className="text-2xl font-bold text-center text-white">
                {player.name}
              </div>
              {!isSelecting && highlightedPlayerIndex === index && (
                <div className="text-center mt-4 text-yellow-300 font-bold text-xl">
                  👈 YOU GO FIRST!
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

  // GAME BOARD
  return (
     <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fadeIn 0.8s ease-out;
        }
        @keyframes slideIn {
          from { 
            opacity: 0; 
            transform: translateX(-100px);
          }
          to { 
            opacity: 1; 
            transform: translateX(0);
          }
        }
      `}</style>
    <div className="min-h-screen relative overflow-hidden" style={{
      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b0764 50%, #1e293b 100%)'
    }}>
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full" style={{
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Meme Video Overlay - HIGHEST Z-INDEX */}
      {playingVideo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
          {playingVideo.url.endsWith('.mp4') || playingVideo.url.endsWith('.webm') ? (
            <video
              src={playingVideo.url}
              autoPlay
              className="max-w-4xl max-h-screen rounded-2xl shadow-2xl"
              onEnded={() => setPlayingVideo(null)}
              onError={(e) => console.error('Video failed to load:', e)}
            />
          ) : (
            <img
              src={playingVideo.url}
              alt="Reaction"
              className="max-w-4xl max-h-screen rounded-2xl shadow-2xl"
            />
          )}
        </div>
      )}

      {/* Question Modal */}
      {currentQuestion && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-3xl max-w-5xl w-full p-8 md:p-12 shadow-2xl border-4 border-yellow-400 relative my-8">
            <button
              onClick={closeQuestion}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-white text-4xl md:text-5xl hover:text-red-400 transition z-10 bg-black/30 rounded-full w-12 h-12 md:w-16 md:h-16 flex items-center justify-center"
            >
              ✕
            </button>

            <div className="text-center mb-6 md:mb-8">
              <p className="text-yellow-300 text-xl md:text-2xl font-bold mb-2">{currentQuestion.category}</p>
              <p className="text-white text-4xl md:text-6xl font-black">{currentQuestion.points} POINTS</p>
            </div>

            {/* Hide question when video is playing for wrong answers, show answer with video for correct */}
            {!playingVideo && !answeredCorrectly && !showAnswer && (
              <div className="bg-white/95 backdrop-blur rounded-2xl p-6 md:p-10 mb-6 md:mb-8">
                {currentQuestion.imageUrl && (
                  <img 
                    src={currentQuestion.imageUrl} 
                    alt="Question" 
                    className="w-full max-h-96 object-contain rounded-lg mb-4 md:mb-6"
                  />
                )}
                {currentQuestion.question && (
                  <p className="text-2xl md:text-4xl font-bold text-gray-800 text-center leading-relaxed">
                    {currentQuestion.question}
                  </p>
                )}
              </div>
            )}

            {showAnswer && !playingVideo && (
              <div className="bg-green-500/20 backdrop-blur rounded-2xl p-6 md:p-8 mb-6 md:mb-8 border-4 border-green-400">
                <p className="text-2xl md:text-3xl font-bold text-green-100 text-center">
                  Answer: {currentQuestion.answer}
                </p>
              </div>
            )}

            {buzzedPlayerId && !answeredCorrectly && !playingVideo && (
              <div className="bg-yellow-400/20 backdrop-blur rounded-2xl p-4 md:p-6 mb-6 md:mb-8 border-4 border-yellow-400 animate-pulse">
                {players.filter(p => p.id === buzzedPlayerId).map(player => (
                  <div key={player.id} className="flex items-center justify-center gap-3 md:gap-4">
                    <span className="text-4xl md:text-6xl">{player.icon}</span>
                    <span className="text-2xl md:text-4xl font-black text-white">{player.name} BUZZED IN!</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 md:gap-4 justify-center flex-wrap">
              <button
                onClick={handleCorrect}
                disabled={!buzzedPlayerId || answeredCorrectly}
                className={`px-6 md:px-8 py-4 md:py-5 rounded-2xl text-xl md:text-2xl font-black transition-all transform ${
                  buzzedPlayerId && !answeredCorrectly
                    ? 'bg-green-500 hover:bg-green-600 text-white hover:scale-105 cursor-pointer'
                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }`}
              >
                ✅ Correct
              </button>

              <button
                onClick={handleWrong}
                disabled={!buzzedPlayerId || answeredCorrectly}
                className={`px-6 md:px-8 py-4 md:py-5 rounded-2xl text-xl md:text-2xl font-black transition-all transform ${
                  buzzedPlayerId && !answeredCorrectly
                    ? 'bg-red-500 hover:bg-red-600 text-white hover:scale-105 cursor-pointer'
                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }`}
              >
                ❌ Wrong
              </button>

              <button
                onClick={toggleShowAnswer}
                disabled={answeredCorrectly}
                className={`px-6 md:px-8 py-4 md:py-5 rounded-2xl text-xl md:text-2xl font-black transition-all transform ${
                  answeredCorrectly
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white hover:scale-105'
                }`}
              >
                👁️ {showAnswer ? 'Hide' : 'Show'} Answer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 p-6">
        <div className="text-center mb-8">
          <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 mb-3" 
              style={{ 
                textShadow: '0 0 40px rgba(255, 215, 0, 0.6)',
                WebkitTextStroke: '3px rgba(255, 215, 0, 0.3)'
              }}>
            JEOPARDY!
          </h1>
          <div className="inline-block bg-white/10 backdrop-blur-sm px-8 py-3 rounded-full border-2 border-yellow-400/30">
            <p className="text-white text-2xl font-bold">
              {buzzedPlayerId ? '⚡ Someone buzzed in!' : '⏳ Waiting for buzz...'}
            </p>
          </div>
        </div>

                {!finalJeopardyPhase && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-7xl mx-auto mb-8">
              {players.map((player) => {
              const isBuzzed = player.id === buzzedPlayerId;
              const isDimmed = buzzedPlayerId && player.id !== buzzedPlayerId;
              const isLocked = lockedPlayers.has(player.id);
              const isActive = player.id === activePlayerId;
      
             return (
             <div
              key={player.id}
             className={`bg-gradient-to-br from-white to-gray-50 rounded-2xl p-5 transition-all duration-300 border-4 ${
             isBuzzed 
                ? 'ring-8 ring-yellow-400 shadow-2xl shadow-yellow-500/50 scale-110 border-yellow-400' 
               : isDimmed 
                ? 'opacity-20 scale-90 border-gray-300' 
                : isLocked
               ? 'opacity-50 border-red-400'
               : isActive && !currentQuestion
                ? 'ring-8 ring-green-400 shadow-2xl shadow-green-500/50 border-green-400 animate-pulse'
               : 'shadow-xl border-purple-300 hover:scale-105'
                  }`}
                  >
              <div className="text-center">
                <div className={`text-6xl mb-2 ${isBuzzed ? 'animate-bounce' : ''}`}>
                {player.icon}
               </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2 truncate">
                 {player.name}
               </h3>
               <div className={`text-3xl font-black ${isBuzzed ? 'text-yellow-500' : 'text-blue-600'}`}>
               {player.score} pts
             </div>
             {isActive && !currentQuestion && (
               <div className="text-2xl mt-2">👈</div>
              )}
                </div>
              </div>
               );
              })}
            </div>
            )}


        <div className="max-w-7xl mx-auto mb-8">
           {!finalJeopardyPhase ? (
         // Regular Jeopardy Board
          <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 rounded-3xl p-6 shadow-2xl border-4 border-blue-700">
            <div className="grid grid-cols-5 gap-3">
            {categories.map((cat, i) => (
             <div key={i} className="bg-gradient-to-b from-blue-600 to-blue-800 text-yellow-300 font-black text-center py-4 rounded-xl border-2 border-blue-500 shadow-lg text-sm md:text-base">
             {cat}
           </div>
              ))}
        
              {POINT_VALUES.map((value, pointIndex) => (
          categories.map((cat, catIndex) => {
            const questionKey = `${pointIndex}-${catIndex}`;
            const isAnswered = answeredQuestions.has(questionKey);
            
            return (
              <div
                key={questionKey}
                onClick={() => !isAnswered && openQuestion(pointIndex, catIndex)}
                className={`text-4xl font-black text-center py-10 rounded-xl transition-all transform border-2 ${
                  isAnswered
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-br from-blue-500 to-blue-700 text-yellow-300 cursor-pointer hover:from-blue-400 hover:to-blue-600 hover:scale-105 shadow-lg hover:shadow-2xl border-blue-400'
                }`}
              >
                {isAnswered ? '—' : value}
              </div>
            );
          })
        ))}
      </div>
       </div>
        ) : (
    // Final Jeopardy Board
    <div className="bg-gradient-to-br from-purple-900 via-pink-900 to-purple-900 rounded-3xl p-12 shadow-2xl border-4 border-yellow-400">
      <div className="text-center">
        <h1 className="text-7xl font-black text-yellow-400 mb-8 animate-pulse" style={{ textShadow: '0 0 30px rgba(255,215,0,0.8)' }}>
          FINAL JEOPARDY
        </h1>
        
        {finalJeopardyPhase === 'transition' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <div className="text-9xl mb-6 animate-bounce">🎊</div>
              <h2 className="text-5xl font-black text-white mb-4">
                ALL QUESTIONS COMPLETE!
              </h2>
              <p className="text-3xl text-yellow-300 font-bold animate-pulse">
                Preparing Final Jeopardy...
              </p>
            </div>
            
            {/* Loading animation */}
            <div className="flex justify-center gap-3 mt-8">
              <div className="w-4 h-4 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-4 h-4 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-4 h-4 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        
        {finalJeopardyPhase === 'category' && (

           <div>
             <div className="bg-blue-900 rounded-2xl p-8 mb-8 border-4 border-blue-500">
                <p className="text-3xl text-yellow-300 font-bold mb-2">Category:</p>
               <p className="text-5xl text-white font-black">{finalJeopardy.category}</p>
             </div>
             <button
               onClick={startWagering}
               className="bg-green-500 hover:bg-green-600 text-white px-12 py-6 rounded-2xl text-3xl font-black"
              >
               Start Wagering →
             </button>
            </div>
        )}
        
         {finalJeopardyPhase === 'wagering' && (
            <div>
             <p className="text-4xl text-white font-bold mb-8">Players are placing their wagers...</p>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
              {players.map(player => (
                  <div key={player.id} className="bg-white/10 p-4 rounded-xl">
                   <div className="text-4xl mb-2">{player.icon}</div>
                   <div className="text-xl text-white font-bold">{player.name}</div>
                   <div className="text-2xl mt-2">
                   {playerWagers[player.id] !== undefined ? '✅' : '⏳'}
                   </div>
                 </div>
               ))}
             </div>
               <button
               onClick={startFinalQuestion}
               disabled={Object.keys(playerWagers).length !== players.length}
               className={`px-12 py-6 rounded-2xl text-3xl font-black ${
                 Object.keys(playerWagers).length === players.length
                   ? 'bg-green-500 hover:bg-green-600 text-white'
                   : 'bg-gray-500 text-gray-300 cursor-not-allowed'
               }`}
             >
               Reveal Question →
             </button>
            </div>
         )}
        
          {finalJeopardyPhase === 'question' && (
            <div>
             <div className="bg-white/95 rounded-2xl p-10 mb-8">
               {finalJeopardy.imageUrl && (
                 <img src={finalJeopardy.imageUrl} alt="Final Jeopardy" className="w-full max-h-96 object-contain mb-6 rounded-lg" />
               )}
               {finalJeopardy.question && (
                 <p className="text-4xl font-bold text-gray-800">{finalJeopardy.question}</p>
               )}
             </div>
             <p className="text-3xl text-white font-bold mb-8">Players are submitting answers...</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
              {players.map(player => (
                  <div key={player.id} className="bg-white/10 p-4 rounded-xl">
                   <div className="text-4xl mb-2">{player.icon}</div>
                   <div className="text-xl text-white font-bold">{player.name}</div>
                  <div className="text-2xl mt-2">
                      {playerAnswers[player.id] ? '✅' : '⏳'}
                   </div>
                 </div>
                ))}
             </div>
             <button
               onClick={reviewAnswers}
                disabled={Object.keys(playerAnswers).length !== players.length}
               className={`px-12 py-6 rounded-2xl text-3xl font-black ${
                 Object.keys(playerAnswers).length === players.length
                   ? 'bg-green-500 hover:bg-green-600 text-white'
                   : 'bg-gray-500 text-gray-300 cursor-not-allowed'
               }`}
             >
              Review Answers →
               </button>
          </div>
         )}

         {finalJeopardyPhase === 'review' && (
           <div>
             <div className="bg-green-500/20 rounded-2xl p-6 mb-8 border-4 border-green-400">
               <p className="text-2xl text-green-100 font-bold mb-2">Correct Answer:</p>
               <p className="text-4xl text-white font-black">{finalJeopardy.answer}</p>
            </div>

             <div className="space-y-4 mb-8">
               {players.map(player => (
                 <div key={player.id} className="bg-white/10 rounded-xl p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                     <span className="text-4xl">{player.icon}</span>
                    <div className="text-left">
                        <p className="text-2xl text-white font-bold">{player.name}</p>
                       <p className="text-xl text-yellow-300">Answer: {playerAnswers[player.id] || '(no answer)'}</p>
                     </div>
                   </div>
                   <button
                     onClick={() => toggleCorrectPlayer(player.id)}
                     className={`w-16 h-16 rounded-full text-3xl font-black transition ${
                       correctPlayers.has(player.id)
                         ? 'bg-green-500 text-white'
                         : 'bg-gray-600 text-gray-300'
                    }`}
                   >
                     {correctPlayers.has(player.id) ? '✓' : ''}
                   </button>
                 </div>
               ))}
              </div>
              
             <button
                 onClick={calculateFinalResults}
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-12 py-6 rounded-2xl text-3xl font-black"
             >
               Calculate Results →
             </button>
           </div>
         )}
         {finalJeopardyPhase === 'results' && (
          <div>
            <h2 className="text-5xl font-black text-white mb-12">
              🏆 FINAL RESULTS 🏆
            </h2>

            <div className="space-y-6 max-w-4xl mx-auto">
              {[...players]
                .sort((a, b) => a.score - b.score) // Sort lowest to highest
                .map((player, index) => {
                  const rank = players.length - index;
                  const isRevealed = index < revealedCount;
                  const isWinner = rank === 1;
                  const wager = playerWagers[player.id] || 0;
                  const wasCorrect = correctPlayers.has(player.id);
                  
                  if (!isRevealed) {
                    return (
                      <div key={player.id} className="bg-white/5 rounded-2xl p-8 animate-pulse">
                  <p className="text-2xl text-white/50 text-center">???</p>
            </div>
             );
                  }
                  
                  return (
                    <div
                      key={player.id}
                      className={`rounded-2xl p-8 transition-all duration-500 transform ${
                        isWinner
                          ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 scale-110 ring-8 ring-yellow-300 animate-pulse'
                          : 'bg-gradient-to-r from-blue-600 to-purple-600'
                      }`}
                      style={{
                        animation: isRevealed ? 'slideIn 0.5s ease-out' : 'none'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className={`text-6xl font-black ${isWinner ? 'text-gray-900' : 'text-yellow-300'}`}>
                            #{rank}
                          </div>
                          <div className="text-7xl">{player.icon}</div>
                          <div>
                            <h3 className={`text-3xl font-bold ${isWinner ? 'text-gray-900' : 'text-white'}`}>
                              {player.name}
                            </h3>
                            <p className={`text-xl mt-1 ${isWinner ? 'text-gray-700' : 'text-white/80'}`}>
                              Wagered: ${wager} • {wasCorrect ? '✅ Correct' : '❌ Wrong'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className={`text-5xl font-black ${isWinner ? 'text-gray-900' : 'text-yellow-300'}`}>
                            ${player.score}
                          </div>
                          {isWinner && (
                            <div className="text-4xl mt-2 animate-bounce">👑</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {revealedCount >= players.length && (
              <div className="mt-12 animate-fade-in">
                <div className="text-center mb-8">
                  <div className="text-8xl mb-4">🎉🎊🎉</div>
                  <h2 className="text-6xl font-black text-yellow-400 mb-2">
                    CONGRATULATIONS!
                  </h2>
                  <p className="text-3xl text-white">
                    {players.sort((a, b) => b.score - a.score)[0].name} WINS!
                  </p>
                </div>
                
                <div className="flex gap-6 justify-center">
                   <button
                  onClick={playAgain}
                   className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white px-12 py-6 rounded-2xl text-2xl font-black shadow-2xl transition-all transform hover:scale-105"
                     >
                 🔄 Play Again<br/>
                 <span className="text-sm font-normal">(Same Questions)</span>
               </button>
      
                 <button
                  onClick={newGame}
                 className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white px-12 py-6 rounded-2xl text-2xl font-black shadow-2xl transition-all transform hover:scale-105"
                >
                🎮 New Game<br/>
               <span className="text-sm font-normal">(New Questions)</span>
               </button>
              </div>
              </div>
            )}
          </div>
        )}
       </div>
        </div>
        )}
      </div>
         <div className="text-center mt-8">
      <button
        onClick={fullReset}
        className="bg-gradient-to-r from-yellow-400 to-orange-500 text-blue-900 px-12 py-5 rounded-2xl text-2xl font-black hover:from-yellow-300 hover:to-orange-400 shadow-2xl hover:shadow-yellow-500/50 transition-all transform hover:scale-105"
      >
        🔄 Reset Buzzer
      </button>
    </div>
      </div>
    </div>
    </>
  );
}