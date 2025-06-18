document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const patientView = document.getElementById('patient-view');
    const completedNumbersDiv = document.getElementById('patient-completed-numbers');
    const waitingNumbersDiv = document.getElementById('patient-waiting-numbers');
    const absentNumbersDiv = document.getElementById('patient-absent-numbers');
    const patientAlert = document.getElementById('patient-fullscreen-alert');
    const patientAlertText = document.getElementById('patient-alert-text');
    const audioUnlockOverlay = document.getElementById('audio-unlock-overlay');
    const startWithAudioBtn = document.getElementById('start-with-audio-btn');
    const startWithoutAudioBtn = document.getElementById('start-without-audio-btn');
    const waitTimeDiv = document.getElementById('wait-time');
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    const chimeSound = new Audio('chime.mp3');

    // --- 変数定義 ---
    let lastCallingNumbers = new Set();
    let audioInitialized = false;
    let isAudioEnabled = false;

    // --- イベントリスナー ---
    function initializeApp(audioEnabled, fromStorage = false) {
        if (audioInitialized && !fromStorage) return;
        audioInitialized = true;
        isAudioEnabled = audioEnabled;
        audioUnlockOverlay.classList.add('hidden');
        audioToggleBtn.classList.remove('hidden');
        updateAudioToggleButton();
        if (isAudioEnabled && !fromStorage) {
            chimeSound.volume = 0;
            chimeSound.play().catch(() => {});
            chimeSound.volume = 1;
        }
        localStorage.setItem('audioChoice', isAudioEnabled ? 'on' : 'off');
        console.log(`音声通知が${isAudioEnabled ? '有効' : '無効'}になりました。`);
    }

    audioToggleBtn.addEventListener('click', () => {
        isAudioEnabled = !isAudioEnabled;
        if (isAudioEnabled) {
            chimeSound.volume = 0;
            chimeSound.play().catch(() => {});
            chimeSound.volume = 1;
        }
        localStorage.setItem('audioChoice', isAudioEnabled ? 'on' : 'off');
        updateAudioToggleButton();
    });

    function updateAudioToggleButton() {
        if (isAudioEnabled) {
            audioToggleBtn.textContent = '🔊 音声ON';
        } else {
            audioToggleBtn.textContent = '🔇 音声OFF';
        }
    }

    startWithAudioBtn.addEventListener('click', () => initializeApp(true));
    startWithoutAudioBtn.addEventListener('click', () => initializeApp(false));

    // --- 関数定義 ---
    function groupConsecutiveNumbers(numbers) {
        if (!numbers || numbers.length === 0) return '---';
        const sorted = [...new Set(numbers.map(Number))].sort((a, b) => a - b);
        let result = [];
        let tempRange = [];
        for (const num of sorted) {
            if (tempRange.length === 0 || num === tempRange[tempRange.length - 1] + 1) {
                tempRange.push(num);
            } else {
                result.push(tempRange);
                tempRange = [num];
            }
        }
        if (tempRange.length > 0) result.push(tempRange);
        return result.map(range => {
            if (range.length >= 2) {
                return `${range[0]}-${range[range.length - 1]}`;
            } else {
                return range.join(', ');
            }
        }).join(', ');
    }
    
    function renderPatientView() {
        const storedStateJSON = localStorage.getItem('clinicCallAppState');
        if (!storedStateJSON) return;
        const state = JSON.parse(storedStateJSON);
        if (!state) return;

        completedNumbersDiv.textContent = groupConsecutiveNumbers(state.completed || []);
        absentNumbersDiv.textContent = (state.absent || []).map(item => item.num).join(', ') || '---';

        const allPreparing = (state.waiting || []).sort((a, b) => {
            if (a.isCalling && !b.isCalling) return -1;
            if (!a.isCalling && b.isCalling) return 1;
            return a.timestamp - b.timestamp;
        });
        const waitingHtml = allPreparing.map(item => {
            const style = `font-weight: ${item.isCalling ? 'bold' : 'normal'}; 
                         color: ${item.isCalling ? '#d93636' : 'inherit'}; 
                         font-size: ${item.isCalling ? '1.5em' : '1em'};`;
            return `<span style="${style}">${item.num}</span>`;
        }).join(', ');
        waitingNumbersDiv.innerHTML = waitingHtml || '---';

        if (allPreparing.length > 0) {
            const firstPatientTimestamp = allPreparing[0].timestamp;
            if (firstPatientTimestamp) {
                const elapsedTimeMinutes = Math.floor((Date.now() - firstPatientTimestamp) / (1000 * 60));
                waitTimeDiv.textContent = `ただいまの待ち時間：約 ${elapsedTimeMinutes} 分`;
            } else {
                waitTimeDiv.textContent = `お待ちの先頭の方から計測します`;
            }
        } else {
            waitTimeDiv.textContent = '現在、会計準備中の方はいません';
        }

        const currentCallingNumbers = new Set(allPreparing.filter(p => p.isCalling).map(p => p.num));
        if (currentCallingNumbers.size > 0) {
            patientView.classList.add('is-calling-active');
        } else {
            patientView.classList.remove('is-calling-active');
        }

        if (!audioInitialized && currentCallingNumbers.size > 0) {
            audioUnlockOverlay.classList.remove('hidden');
        }

        const newCalls = [...currentCallingNumbers].filter(num => !lastCallingNumbers.has(num));
        if (newCalls.length > 0) {
            const newCallNumber = newCalls[0];
            patientAlertText.innerHTML = `<span class="highlight">${newCallNumber}番</span>`;
            patientAlert.classList.remove('hidden');
            setTimeout(() => {
                patientAlert.classList.add('hidden');
            }, 10000);
            if (isAudioEnabled) {
                chimeSound.play().catch(e => console.error("音声の再生に失敗しました:", e));
                chimeSound.onended = () => {
                    const utterance = new SpeechSynthesisUtterance(`${newCallNumber}番のかた、会計の準備が整いました。フロア受付までお越しください。`);
                    utterance.lang = 'ja-JP';
                    speechSynthesis.speak(utterance);
                };
            }
        }
        lastCallingNumbers = currentCallingNumbers;
    }

    const savedAudioChoice = localStorage.getItem('audioChoice');
    if (savedAudioChoice !== null) {
        initializeApp(savedAudioChoice === 'on', true);
    }

    setInterval(renderPatientView, 1000);
    renderPatientView();
});