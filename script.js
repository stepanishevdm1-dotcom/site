// Конфигурация Firebase (замените на свою!)
// Инструкция по получению этих данных ниже
const firebaseConfig = {
    apiKey: "ВАШ_API_KEY",
    authDomain: "ВАШ_PROJECT.firebaseapp.com",
    databaseURL: "https://ВАШ_PROJECT.firebaseio.com",
    projectId: "ВАШ_PROJECT",
    storageBucket: "ВАШ_PROJECT.appspot.com",
    messagingSenderId: "ВАШ_SENDER_ID",
    appId: "ВАШ_APP_ID"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentRoom = null;
let mediaRecorder = null;
let audioChunks = [];

// Войти в комнату
function joinRoom() {
    const roomCode = document.getElementById('roomCode').value.trim();
    if (!roomCode) {
        alert('Введите код комнаты!');
        return;
    }
    
    currentRoom = roomCode;
    document.getElementById('currentRoom').textContent = roomCode;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('room').style.display = 'block';
    document.getElementById('sendBtn').disabled = false;
    
    // Слушаем сигналы
    database.ref('rooms/' + roomCode + '/signal').on('value', (snapshot) => {
        if (snapshot.exists()) {
            playSound();
            document.getElementById('status').innerHTML = '🔔 Сигнал получен! ' + new Date().toLocaleTimeString();
        }
    });
    
    // Слушаем голосовые сообщения
    database.ref('rooms/' + roomCode + '/audio').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const audioData = snapshot.val();
            playAudioMessage(audioData);
        }
    });
}

// Отправить сигнал
function sendSignal() {
    if (!currentRoom) return;
    
    database.ref('rooms/' + currentRoom + '/signal').set({
        timestamp: Date.now()
    }).then(() => {
        document.getElementById('status').innerHTML = '✅ Сигнал отправлен! ' + new Date().toLocaleTimeString();
        
        // Удалить сигнал через секунду
        setTimeout(() => {
            database.ref('rooms/' + currentRoom + '/signal').remove();
        }, 1000);
    });
}

// Воспроизвести звук сигнала
function playSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// Начать запись
function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });
            
            mediaRecorder.addEventListener('stop', () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                sendAudioMessage(audioBlob);
            });
            
            mediaRecorder.start();
            
            document.getElementById('recordBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('status').textContent = '🎤 Запись...';
        })
        .catch(error => {
            console.error('Ошибка доступа к микрофону:', error);
            alert('Не удалось получить доступ к микрофону');
        });
}

// Остановить запись
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('status').textContent = 'Обработка записи...';
    }
}

// Отправить голосовое сообщение
function sendAudioMessage(audioBlob) {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = function() {
        const base64Audio = reader.result;
        
        database.ref('rooms/' + currentRoom + '/audio').set({
            data: base64Audio,
            timestamp: Date.now()
        }).then(() => {
            document.getElementById('status').textContent = '✅ Голосовое отправлено!';
            
            // Воспроизвести на этом же устройстве
            playAudioMessage({ data: base64Audio });
        });
    };
}

// Воспроизвести голосовое сообщение
function playAudioMessage(audioData) {
    const audio = document.getElementById('audioPlayback');
    audio.src = audioData.data;
    
    document.getElementById('status').textContent = '🔊 Голосовое получено!';
    
    // Автовоспроизведение после загрузки
    audio.onloadeddata = function() {
        audio.play().catch(e => console.log('Автовоспроизведение заблокировано'));
    };
}
