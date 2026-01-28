// Глобальные переменные
let currentRoom = null;
let peerConnection = null;
let dataChannel = null;
let mediaRecorder = null;
let audioChunks = [];
let localStream = null;

// Функция для создания или присоединения к комнате
async function createOrJoinRoom() {
    const roomCode = document.getElementById('roomCode').value.trim();
    if (!roomCode) {
        alert('Введите код комнаты!');
        return;
    }
    
    currentRoom = roomCode;
    document.getElementById('currentRoom').textContent = roomCode;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('room').style.display = 'block';
    
    // Пытаемся установить P2P соединение
    await initPeerConnection();
}

// Инициализация P2P соединения (WebRTC)
async function initPeerConnection() {
    try {
        // Создаём PeerConnection с STUN серверами (помогают с подключением)
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        peerConnection = new RTCPeerConnection(configuration);
        
        // Создаём канал данных для обмена сообщениями
        dataChannel = peerConnection.createDataChannel('signaling');
        
        // Обработчики событий канала данных
        dataChannel.onopen = () => {
            document.getElementById('status').innerHTML = '✅ Соединение установлено!';
            document.getElementById('signalBtn').disabled = false;
            console.log('Канал данных открыт');
        };
        
        dataChannel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleReceivedMessage(message);
        };
        
        dataChannel.onerror = (error) => {
            console.error('Ошибка канала данных:', error);
            document.getElementById('status').innerHTML = '❌ Ошибка соединения';
        };
        
        // Получаем доступ к микрофону для голосовых сообщений
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Добавляем поток в соединение (для будущих расширений)
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        } catch (err) {
            console.log('Микрофон недоступен, но сигналы будут работать');
        }
        
        // Создаём предложение (offer)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // В реальном приложении здесь нужно отправить offer через сервер-сигналинг
        // Но для простоты мы сэмулируем это локально
        setTimeout(() => simulateSignaling(offer), 500);
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        document.getElementById('status').innerHTML = '❌ Не удалось установить соединение';
    }
}

// Эмуляция обмена сигналами (в реальном приложении нужен сервер)
function simulateSignaling(offer) {
    // В реальном приложении здесь должен быть AJAX запрос к серверу
    // Но для демонстрации мы просто создаём ответ локально
    setTimeout(async () => {
        try {
            const peerConnection2 = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            // Обработчик входящего канала данных
            peerConnection2.ondatachannel = (event) => {
                const dataChannel2 = event.channel;
                dataChannel2.onopen = () => {
                    console.log('Второй канал открыт');
                    
                    // Отправляем тестовое сообщение
                    setTimeout(() => {
                        dataChannel2.send(JSON.stringify({ type: 'connected' }));
                    }, 200);
                };
                
                dataChannel2.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    // Здесь второй клиент получит сообщения
                    console.log('Второй клиент получил:', message);
                };
            };
            
            await peerConnection2.setRemoteDescription(offer);
            const answer = await peerConnection2.createAnswer();
            await peerConnection2.setLocalDescription(answer);
            
            // Завершаем соединение
            await peerConnection.setRemoteDescription(answer);
            
        } catch (error) {
            console.error('Ошибка эмуляции:', error);
            document.getElementById('status').innerHTML = '⚠️ Соединение в тестовом режиме';
        }
    }, 1000);
}

// Обработка полученных сообщений
function handleReceivedMessage(message) {
    switch (message.type) {
        case 'signal':
            playSignalSound();
            document.getElementById('status').innerHTML = 
                `🔔 Сигнал получен! ${new Date().toLocaleTimeString()}`;
            break;
            
        case 'audio':
            playAudioMessage(message.data);
            document.getElementById('audioStatus').textContent = 
                `🔊 Голосовое сообщение получено ${new Date().toLocaleTimeString()}`;
            break;
            
        case 'connected':
            document.getElementById('status').innerHTML = '✅ Соединение установлено!';
            document.getElementById('signalBtn').disabled = false;
            break;
    }
}

// Отправка сигнала
function sendSignal() {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Соединение не установлено');
        return;
    }
    
    const message = { type: 'signal', timestamp: Date.now() };
    dataChannel.send(JSON.stringify(message));
    
    document.getElementById('status').innerHTML = 
        `✅ Сигнал отправлен! ${new Date().toLocaleTimeString()}`;
}

// Воспроизведение звука сигнала
function playSignalSound() {
    try {
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
    } catch (e) {
        console.log('Аудио контекст не поддерживается');
    }
}

// Запись голосового сообщения
async function startRecording() {
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            alert('Не удалось получить доступ к микрофону');
            return;
        }
    }
    
    mediaRecorder = new MediaRecorder(localStream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        sendAudioMessage(audioBlob);
    };
    
    mediaRecorder.start();
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('audioStatus').textContent = '🎤 Запись...';
}

// Остановка записи
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('audioStatus').textContent = 'Обработка...';
    }
}

// Отправка голосового сообщения
function sendAudioMessage(audioBlob) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Соединение не установлено для отправки аудио');
        return;
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = function() {
        const base64Audio = reader.result;
        const message = { type: 'audio', data: base64Audio };
        
        // Отправляем через канал данных
        dataChannel.send(JSON.stringify(message));
        
        // Также воспроизводим локально
        playAudioMessage(base64Audio);
        
        document.getElementById('audioStatus').textContent = '✅ Голосовое отправлено!';
    };
}

// Воспроизведение голосового сообщения
function playAudioMessage(base64Audio) {
    const audioElement = document.getElementById('receivedAudio');
    audioElement.src = base64Audio;
    
    audioElement.onloadeddata = () => {
        audioElement.play().catch(e => {
            console.log('Автовоспроизведение заблокировано');
        });
    };
}
