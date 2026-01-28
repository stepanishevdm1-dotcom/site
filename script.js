// Глобальные переменные
let currentRole = null;
let currentRoom = null;
let githubToken = null;
let gistId = null;
let selectedSound = 'bell';
let lastUpdateTime = null;
let checkInterval = null;

// Список звуков
const sounds = {
    'bell': { name: '🔔 Звонок', url: 'bell' },
    'alert': { name: '🚨 Тревога', url: 'alert' },
    'message': { name: '📬 Сообщение', url: 'message' },
    'success': { name: '✅ Успех', url: 'success' },
    'notify': { name: '📢 Уведомление', url: 'notify' },
    'horn': { name: '📯 Горн', url: 'horn' }
};

// Выбор роли
function selectRole(role) {
    currentRole = role;
    document.getElementById('roleSelection').classList.add('hidden');
    document.getElementById('roomSetup').classList.remove('hidden');
}

// Подключиться к комнате
async function joinRoom() {
    githubToken = document.getElementById('githubToken').value.trim();
    currentRoom = document.getElementById('roomCode').value.trim();
    
    if (!githubToken || !githubToken.startsWith('ghp_')) {
        alert('Введите корректный GitHub Token (начинается с ghp_)');
        return;
    }
    
    if (!currentRoom) {
        alert('Введите код комнаты');
        return;
    }
    
    document.getElementById('roomSetup').classList.add('hidden');
    
    try {
        // Создаем или получаем Gist
        gistId = await getOrCreateGist();
        
        if (currentRole === 'sender') {
            document.getElementById('senderInterface').classList.remove('hidden');
            document.getElementById('senderRoomCode').textContent = currentRoom;
            document.getElementById('senderStatus').textContent = 'Готов к отправке звуков';
        } else {
            document.getElementById('receiverInterface').classList.remove('hidden');
            document.getElementById('receiverRoomCode').textContent = currentRoom;
            document.getElementById('receiverStatus').textContent = 'Слушаю обновления...';
            
            // Запускаем проверку обновлений
            startCheckingForUpdates();
        }
        
        console.log(`Подключен как ${currentRole} в комнате ${currentRoom}`);
        
    } catch (error) {
        alert('Ошибка подключения: ' + error.message);
        console.error(error);
    }
}

// Создать или получить Gist
async function getOrCreateGist() {
    const gistFilename = `sound_room_${currentRoom}.json`;
    
    try {
        // Пробуем найти существующий Gist
        const response = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const gists = await response.json();
        
        for (const gist of gists) {
            if (gist.files[gistFilename]) {
                console.log('Найден существующий Gist:', gist.id);
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
                description: `Sound Room: ${currentRoom}`,
                public: true,
                files: {
                    [gistFilename]: {
                        content: JSON.stringify({
                            room: currentRoom,
                            lastSound: null,
                            lastUpdate: null,
                            history: []
                        }, null, 2)
                    }
                }
            })
        });
        
        const newGist = await createResponse.json();
        console.log('Создан новый Gist:', newGist.id);
        return newGist.id;
        
    } catch (error) {
        throw new Error('Не удалось создать/найти Gist: ' + error.message);
    }
}

// Выбор звука (для отправителя)
function selectSound(soundId) {
    selectedSound = soundId;
    document.getElementById('selectedSoundName').textContent = sounds[soundId].name;
    
    // Подсветка выбранной кнопки
    document.querySelectorAll('.sound-btn').forEach(btn => {
        btn.style.opacity = '0.7';
    });
    event.target.style.opacity = '1';
    event.target.style.boxShadow = '0 0 0 3px rgba(155, 89, 182, 0.5)';
}

// Отправить звук (для отправителя)
async function sendSound() {
    if (!gistId || !selectedSound) return;
    
    const soundName = sounds[selectedSound].name;
    document.getElementById('senderStatus').innerHTML = `Отправка звука: ${soundName}...`;
    document.getElementById('sendButton').disabled = true;
    
    try {
        // Получаем текущий Gist
        const gistResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const gist = await gistResponse.json();
        const gistFilename = `sound_room_${currentRoom}.json`;
        const currentContent = JSON.parse(gist.files[gistFilename].content);
        
        // Обновляем данные
        const now = new Date().toISOString();
        const newData = {
            room: currentRoom,
            lastSound: selectedSound,
            lastUpdate: now,
            lastSender: 'Отправитель',
            history: [...(currentContent.history || []), {
                sound: selectedSound,
                name: soundName,
                time: now,
                sender: 'Отправитель'
            }].slice(-10) // Храним только последние 10 звуков
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
                        content: JSON.stringify(newData, null, 2)
                    }
                }
            })
        });
        
        if (updateResponse.ok) {
            document.getElementById('senderStatus').innerHTML = 
                `✅ Звук "${soundName}" отправлен!<br><small>${new Date().toLocaleTimeString()}</small>`;
            
            // Воспроизводим звук локально (для обратной связи)
            playSound(selectedSound);
            
            // Ждем немного и сбрасываем статус
            setTimeout(() => {
                document.getElementById('senderStatus').textContent = 'Готов к отправке';
                document.getElementById('sendButton').disabled = false;
            }, 3000);
            
        } else {
            throw new Error('Ошибка обновления Gist');
        }
        
    } catch (error) {
        document.getElementById('senderStatus').textContent = '❌ Ошибка отправки: ' + error.message;
        document.getElementById('sendButton').disabled = false;
        console.error(error);
    }
}

// Начать проверку обновлений (для приёмника)
function startCheckingForUpdates() {
    // Проверяем сразу при запуске
    checkForUpdates();
    
    // Затем каждые 5 секунд
    checkInterval = setInterval(checkForUpdates, 5000);
}

// Проверить обновления (для приёмника)
async function checkForUpdates() {
    if (!gistId) return;
    
    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) throw new Error('Не удалось получить Gist');
        
        const gist = await response.json();
        const gistFilename = `sound_room_${currentRoom}.json`;
        
        if (!gist.files[gistFilename]) {
            throw new Error('Файл комнаты не найден');
        }
        
        const data = JSON.parse(gist.files[gistFilename].content);
        
        // Если есть новое обновление
        if (data.lastUpdate && data.lastUpdate !== lastUpdateTime && data.lastSound) {
            lastUpdateTime = data.lastUpdate;
            
            // Обновляем статус
            const soundName = sounds[data.lastSound]?.name || data.lastSound;
            const time = new Date(data.lastUpdate).toLocaleTimeString();
            
            document.getElementById('receiverStatus').innerHTML = 
                `🔔 Новый звук: ${soundName}<br><small>${time}</small>`;
            
            document.getElementById('lastMessage').innerHTML = 
                `<div style="background:#e1f5fe; padding:10px; border-radius:8px; margin:10px 0;">
                    <strong>Получено:</strong> ${soundName}<br>
                    <small>Время: ${time}</small>
                </div>`;
            
            // Воспроизводим звук
            playSound(data.lastSound);
        }
        
    } catch (error) {
        console.error('Ошибка проверки:', error);
        document.getElementById('receiverStatus').textContent = '❌ Ошибка проверки обновлений';
    }
}

// Воспроизвести звук
function playSound(soundId) {
    const audioElement = document.getElementById(`sound-${soundId}`);
    if (audioElement) {
        audioElement.currentTime = 0;
        audioElement.play().catch(e => {
            console.log('Автовоспроизведение заблокировано');
        });
    }
}

// Очистка при закрытии (для приёмника)
window.addEventListener('beforeunload', function() {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
});

// Инициализация
window.onload = function() {
    // Выбираем первый звук по умолчанию
    selectSound('bell');
};
