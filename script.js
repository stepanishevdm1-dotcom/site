// Глобальные переменные
let currentRole = null;
let currentRoom = "soundroom1";
let githubToken = null;
let gistId = null;
let mediaRecorder = null;
let audioChunks = [];
let localStream = null;
let isRecording = false;
let checkInterval = null;

// Звуки для теста
const testSounds = {
    'bell': '🔔 Звонок',
    'alert': '🚨 Тревога', 
    'message': '📬 Уведомление'
};

// 1. Выбор роли
function selectRole(role) {
    currentRole = role;
    console.log(`Выбрана роль: ${role}`);
    
    // Показываем шаг 2 (токен)
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    
    // Если токен уже сохранен в localStorage
    const savedToken = localStorage.getItem('github_token');
    if (savedToken) {
        document.getElementById('githubToken').value = savedToken;
        document.getElementById('tokenStatus').innerHTML = '✅ Токен найден в памяти браузера';
    }
}

// 2. Сохранить токен и подключиться
async function saveToken() {
    githubToken = document.getElementById('githubToken').value.trim();
    currentRoom = document.getElementById('roomCode').value.trim() || "soundroom1";
    
    if (!githubToken) {
        alert('Введите GitHub Token!');
        return;
    }
    
    if (!githubToken.startsWith('ghp_')) {
        alert('Токен должен начинаться с ghp_');
        return;
    }
    
    // Сохраняем токен в localStorage
    localStorage.setItem('github_token', githubToken);
    document.getElementById('tokenStatus').innerHTML = '✅ Токен сохранен!';
    
    // Скрываем шаг 2
    document.getElementById('step2').classList.add('hidden');
    
    // Показываем интерфейс в зависимости от роли
    if (currentRole === 'sender') {
        document.getElementById('senderInterface').classList.remove('hidden');
        document.getElementById('senderRoom').textContent = currentRoom;
        setupSender();
    } else {
        document.getElementById('receiverInterface').classList.remove('hidden');
        document.getElementById('receiverRoom').textContent = currentRoom;
        setupReceiver();
    }
}

// 3. Настройка отправителя
async function setupSender() {
    try {
        // Запрашиваем доступ к микрофону
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон доступен");
        document.getElementById('senderStatus').textContent = "✅ Микрофон готов";
    } catch (err) {
        console.error("Ошибка микрофона:", err);
        document.getElementById('senderStatus').textContent = "❌ Микрофон недоступен";
    }
    
    // Инициализируем Gist
    try {
        gistId = await getOrCreateGist();
        console.log("Gist ID:", gistId);
    } catch (error) {
        console.error("Ошибка Gist:", error);
        document.getElementById('senderStatus').textContent = "❌ Ошибка подключения к GitHub";
    }
}

// 4. Настройка приёмника
async function setupReceiver() {
    try {
        gistId = await getOrCreateGist();
        console.log("Приёмник: Gist ID", gistId);
        document.getElementById('receiverStatus').textContent = "✅ Подключено к комнате";
        
        // Запускаем проверку обновлений
        checkForUpdates();
        checkInterval = setInterval(checkForUpdates, 5000);
    } catch (error) {
        console.error("Ошибка приёмника:", error);
        document.getElementById('receiverStatus').textContent = "❌ Ошибка подключения";
    }
}

// 5. Создать/получить Gist
async function getOrCreateGist() {
    const gistFilename = `sound_button_${currentRoom}.json`;
    
    try {
        // Пробуем найти существующий Gist
        const response = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) throw new Error('GitHub API error: ' + response.status);
        
        const gists = await response.json();
        
        // Ищем наш Gist
        for (const gist of gists) {
            if (gist.files && gist.files[gistFilename]) {
                console.log("Найден существующий Gist:", gist.id);
                return gist.id;
            }
        }
        
        // Создаем новый Gist
        const createResponse = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: `Sound Button Room: ${currentRoom}`,
                public: false, // Приватный Gist
                files: {
                    [gistFilename]: {
                        content: JSON.stringify({
                            room: currentRoom,
                            lastMessage: null,
                            lastUpdate: null,
                            messages: []
                        }, null, 2)
                    }
                }
            })
        });
        
        if (!createResponse.ok) throw new Error('Failed to create Gist');
        
        const newGist = await createResponse.json();
        console.log("Создан новый Gist:", newGist.id);
        return newGist.id;
        
    } catch (error) {
        console.error("Gist error:", error);
        throw error;
    }
}

// 6. Начать запись голоса
function startRecording() {
    if (!localStream) {
        alert('Сначала разрешите доступ к микрофону!');
        return;
    }
    
    isRecording = true;
    audioChunks = [];
    
    // Показываем кнопку остановки
    document.getElementById('recordBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');
    document.getElementById('recordingStatus').innerHTML = '🔴 <strong>Идет запись...</strong> Говорите в микрофон';
    
    // Начинаем запись
    mediaRecorder = new MediaRecorder(localStream);
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
            await sendAudioMessage();
        }
        resetRecordingUI();
    };
    
    mediaRecorder.start();
}

// 7. Остановить запись
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
    }
}

// 8. Сброс интерфейса записи
function resetRecordingUI() {
    document.getElementById('recordBtn').classList.remove('hidden');
    document.getElementById('stopBtn').classList.add('hidden');
}

// 9. Отправить аудио сообщение
async function sendAudioMessage() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    // Конвертируем в base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    
    reader.onloadend = async function() {
        const base64Audio = reader.result;
        const messageId = 'msg_' + Date.now();
        
        try {
            // Получаем текущий Gist
            const gistResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!gistResponse.ok) throw new Error('Failed to get Gist');
            
            const gist = await gistResponse.json();
            const gistFilename = `sound_button_${currentRoom}.json`;
            const currentData = JSON.parse(gist.files[gistFilename].content);
            
            const now = new Date().toISOString();
            
            // Создаем новое сообщение
            const newMessage = {
                id: messageId,
                type: 'audio',
                data: base64Audio,
                sender: 'Отправитель',
                timestamp: now,
                size: audioBlob.size
            };
            
            // Обновляем данные
            const updatedData = {
                room: currentRoom,
                lastMessage: newMessage,
                lastUpdate: now,
                messages: [...(currentData.messages || []), newMessage].slice(-20) // Храним 20 последних
            };
            
            // Обновляем Gist
            const updateResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        [gistFilename]: {
                            content: JSON.stringify(updatedData, null, 2)
                        }
                    }
                })
            });
            
            if (updateResponse.ok) {
                document.getElementById('recordingStatus').innerHTML = 
                    '✅ Сообщение отправлено! ' + new Date().toLocaleTimeString();
                
                // Очищаем статус через 3 секунды
                setTimeout(() => {
                    document.getElementById('recordingStatus').innerHTML = '';
                }, 3000);
                
            } else {
                throw new Error('Failed to update Gist');
            }
            
        } catch (error) {
            console.error("Ошибка отправки:", error);
            document.getElementById('recordingStatus').innerHTML = '❌ Ошибка отправки';
        }
    };
}

// 10. Проверка обновлений (для приёмника)
async function checkForUpdates() {
    if (!gistId) return;
    
    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) return;
        
        const gist = await response.json();
        const gistFilename = `sound_button_${currentRoom}.json`;
        
        if (!gist.files || !gist.files[gistFilename]) return;
        
        const data = JSON.parse(gist.files[gistFilename].content);
        
        // Если есть новое сообщение
        if (data.lastMessage && data.lastMessage.type === 'audio') {
            const msg = data.lastMessage;
            
            // Проверяем, не было ли уже показано
            const lastMsgId = localStorage.getItem('last_msg_id');
            if (lastMsgId === msg.id) return;
            
            // Сохраняем ID сообщения
            localStorage.setItem('last_msg_id', msg.id);
            
            // Обновляем интерфейс
            const time = new Date(msg.timestamp).toLocaleTimeString();
            document.getElementById('receiverStatus').innerHTML = 
                `🔔 Новое сообщение от ${msg.sender}`;
            
            document.getElementById('lastMessageTime').innerHTML = 
                `📅 ${time}`;
            
            // Воспроизводим аудио
            const audioElement = document.getElementById('receivedAudio');
            audioElement.src = msg.data;
            
            // Автовоспроизведение
            audioElement.onloadeddata = function() {
                audioElement.play().catch(e => {
                    console.log("Автовоспроизведение заблокировано");
                });
            };
            
            // Добавляем в историю
            addToMessageHistory(msg);
        }
        
    } catch (error) {
        console.error("Ошибка проверки:", error);
    }
}

// 11. Добавить сообщение в историю
function addToMessageHistory(message) {
    const historyDiv = document.getElementById('messageHistory');
    const time = new Date(message.timestamp).toLocaleTimeString();
    
    const msgElement = document.createElement('div');
    msgElement.style.padding = '10px';
    msgElement.style.margin = '5px 0';
    msgElement.style.background = '#e8f4f8';
    msgElement.style.borderRadius = '8px';
    msgElement.innerHTML = `
        <strong>📨 Сообщение от ${message.sender}</strong><br>
        <small>Время: ${time}</small><br>
        <small>Размер: ${Math.round(message.size / 1024)} KB</small>
    `;
    
    historyDiv.prepend(msgElement);
    
    // Ограничиваем историю 10 сообщениями
    const children = historyDiv.children;
    if (children.length > 10) {
        historyDiv.removeChild(children[children.length - 1]);
    }
}

// 12. Воспроизвести тестовый звук
function playTestSound(soundType) {
    const audio = document.getElementById(`sound-${soundType}`);
    if (audio) {
        audio.currentTime = 0;
        audio.play();
        
        // Показываем в плеере
        const preview = document.getElementById('previewAudio');
        preview.src = audio.src;
    }
}

// 13. Очистка при закрытии
window.addEventListener('beforeunload', function() {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});
