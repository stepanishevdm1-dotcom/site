// Конфигурация Firebase (ЗАМЕНИТЕ на свою!)
const firebaseConfig = {
    apiKey: "AIzaSyBq_07JyLmJgC3hNvK5Qd7W6qX2Z1Y8abcd",
    authDomain: "soundbutton-12345.firebaseapp.com",
    databaseURL: "https://soundbutton-12345-default-rtdb.firebaseio.com",
    projectId: "soundbutton-12345",
    storageBucket: "soundbutton-12345.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentRole = null;
let currentRoom = null;
let mediaRecorder = null;
let audioChunks = [];
let localStream = null;
let isRecording = false;

// Выбор роли
function selectRole(role) {
    currentRole = role;
    document.getElementById('roleSelection').classList.add('hidden');
    document.getElementById('roomSelection').classList.remove('hidden');
    
    if (role === 'sender') {
        // Запрашиваем доступ к микрофону заранее
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                localStream = stream;
                console.log("Микрофон доступен");
            })
            .catch(err => {
                console.error("Ошибка микрофона:", err);
                alert("Разрешите доступ к микрофону!");
            });
    }
}

// Подключиться к комнате
function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    if (!roomCode) {
        alert('Введите код комнаты!');
        return;
    }
    
    currentRoom = roomCode;
    document.getElementById('roomSelection').classList.add('hidden');
    
    if (currentRole === 'sender') {
        document.getElementById('senderInterface').classList.remove('hidden');
        document.getElementById('senderRoomCode').textContent = roomCode;
        setupSender();
    } else {
        document.getElementById('receiverInterface').classList.remove('hidden');
        document.getElementById('receiverRoomCode').textContent = roomCode;
        setupReceiver();
    }
}

// Настройка отправителя
function setupSender() {
    // Слушаем подтверждения доставки
    database.ref('rooms/' + currentRoom + '/delivery').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.type === 'received') {
                document.getElementById('recordingStatus').innerHTML = 
                    '✅ Сообщение доставлено! ' + new Date().toLocaleTimeString();
            }
        }
    });
}

// Настройка приёмника
function setupReceiver() {
    // Слушаем входящие голосовые сообщения
    database.ref('rooms/' + currentRoom + '/audio').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const audioData = snapshot.val();
            playAudioMessage(audioData);
            
            // Подтверждаем получение
            database.ref('rooms/' + currentRoom + '/delivery').set({
                type: 'received',
                timestamp: Date.now(),
                from: audioData.senderId
            });
            
            // Удаляем подтверждение через 2 секунды
            setTimeout(() => {
                database.ref('rooms/' + currentRoom + '/delivery').remove();
            }, 2000);
        }
    });
}

// Начать запись (для отправителя)
function startRecording() {
    if (!localStream) {
        alert('Микрофон не доступен!');
        return;
    }
    
    isRecording = true;
    document.getElementById('signalBtn').innerHTML = '🎤<br>Говорите...';
    document.getElementById('signalBtn').style.background = 'linear-gradient(135deg, #F44336, #B71C1C)';
    document.getElementById('recordingStatus').innerHTML = '● Запись... Отпустите кнопку';
    
    // Начинаем запись
    mediaRecorder = new MediaRecorder(localStream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = () => {
        if (audioChunks.length > 0) {
            sendAudioMessage();
        }
        resetButton();
    };
    
    mediaRecorder.start();
    
    // Меняем кнопку на "отпустите"
    const signalBtn = document.getElementById('signalBtn');
    signalBtn.onmouseup = signalBtn.ontouchend = stopRecording;
    signalBtn.onmouseleave = stopRecording;
}

// Остановить запись
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
    }
}

// Сброс кнопки
function resetButton() {
    document.getElementById('signalBtn').innerHTML = '🎤<br>Говорить';
    document.getElementById('signalBtn').style.background = 'linear-gradient(135deg, #FF5722, #D84315)';
    
    const signalBtn = document.getElementById('signalBtn');
    signalBtn.onmouseup = signalBtn.ontouchend = null;
    signalBtn.onmouseleave = null;
}

// Отправить голосовое сообщение
function sendAudioMessage() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = function() {
        const base64Audio = reader.result;
        
        // Отправляем в Firebase
        database.ref('rooms/' + currentRoom + '/audio').set({
            data: base64Audio,
            timestamp: Date.now(),
            senderId: generateId(),
            duration: audioBlob.size
        }).then(() => {
            document.getElementById('recordingStatus').innerHTML = '⏳ Отправка...';
            
            // Очищаем через 5 секунд
            setTimeout(() => {
                database.ref('rooms/' + currentRoom + '/audio').remove();
            }, 5000);
        });
    };
}

// Воспроизвести сообщение (для приёмника)
function playAudioMessage(audioData) {
    const audioElement = document.getElementById('receiverAudio');
    audioElement.src = audioData.data;
    
    document.getElementById('messageStatus').innerHTML = 
        '🔔 Новое сообщение! ' + new Date().toLocaleTimeString();
    
    // Автовоспроизведение
    audioElement.onloadeddata = function() {
        audioElement.play().catch(e => {
            // Если автовоспроизведение заблокировано
            document.getElementById('messageStatus').innerHTML += 
                '<br>Нажмите play для прослушивания';
        });
    };
}

// Генератор ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Обработка касаний на мобильных
document.getElementById('signalBtn').addEventListener('touchstart', function(e) {
    if (currentRole === 'sender' && !isRecording) {
        e.preventDefault();
        startRecording();
    }
});

// Автоотпускание при потере фокуса
window.addEventListener('blur', function() {
    if (isRecording) {
        stopRecording();
    }
});
