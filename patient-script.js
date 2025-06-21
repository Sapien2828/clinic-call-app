document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const completedNumbersDiv = document.getElementById('patient-completed-numbers');
    const waitingNumbersDiv = document.getElementById('patient-waiting-numbers');
    const absentNumbersDiv = document.getElementById('patient-absent-numbers');
    const waitTimeDiv = document.getElementById('wait-time');
    const patientView = document.getElementById('patient-view');
    const patientAlert = document.getElementById('patient-fullscreen-alert');
    const patientAlertText = document.getElementById('patient-alert-text');
    const audioUnlockOverlay = document.getElementById('audio-unlock-overlay');
    const startWithAudioBtn = document.getElementById('start-with-audio-btn');
    const startWithoutAudioBtn = document.getElementById('start-without-audio-btn');
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    const chimeSound = new Audio('chime.mp3');

    // --- 変数定義 ---
    let lastCallingNumbers = new Set();
    let isAudioEnabled = false;

    // --- Firebaseデータベースへの参照 ---
    const db = firebase.database();
    const appStateRef = db.ref('appState');

    // --- リアルタイム更新 ---
    appStateRef.on('value', (snapshot) => {
        const state = snapshot.val();
        renderPatientView(state || { waiting: [], absent: [], completed: [] });
    });

    // --- 表示を更新するメイン関数 ---
    function renderPatientView(state) {
        completedNumbersDiv.textContent = groupConsecutiveNumbers(state.completed || []);
        absentNumbersDiv.textContent = (state.absent || []).map(item => item.num).join(', ') || '---';

        const allPreparing = (state.waiting || []).sort((a, b) => a.timestamp - b.timestamp);
        const waitingHtml = allPreparing.map(item => {
            const style = `font-weight: ${item.isCalling ? 'bold' : 'normal'}; color: ${item.isCalling ? '#d93636' : 'inherit'}; font-size: ${item.isCalling ? '1.5em' : '1em'};`;
            return `<span style="${style}">${item.num}</span>`;
        }).join(', ');
        waitingNumbersDiv.innerHTML = waitingHtml || '---';

        if (allPreparing.length > 0) {
            const firstPatientTimestamp = allPreparing[0].timestamp;
            const elapsedTimeMinutes = Math.floor((Date.now() - firstPatientTimestamp) / (1000 * 60));
            waitTimeDiv.textContent = `ただいまの待ち時間：約 ${elapsedTimeMinutes} 分`;
        } else {
            waitTimeDiv.textContent = '現在、会計準備中の方はいません';
        }

        const currentCallingNumbers = new Set(allPreparing.filter(p => p.isCalling).map(p => p.num));
        if (currentCallingNumbers.size > 0) {
            patientView.classList.add('is-calling-active');
        } else {
            patientView.classList.remove('is-calling-active');
        }
        
        const newCalls = [...currentCallingNumbers].filter(num => !lastCallingNumbers.has(num));
        if (newCalls.length > 0) {
            const newCallNumber = newCalls[0];
            patientAlertText.innerHTML = `<span class="highlight">${newCallNumber}番</span>`;
            patientAlert.classList.remove('hidden');
            setTimeout(() => patientAlert.classList.add('hidden'), 10000);

            if (isAudioEnabled) {
                const utterance = new SpeechSynthesisUtterance(`${newCallNumber}番のかた、会計の準備が整いました。フロア受付までお越しください。`);
                utterance.lang = 'ja-JP';
                speechSynthesis.speak(utterance);
                
                setTimeout(() => {
                    chimeSound.play().catch(e => console.error("チャイム再生に失敗:", e));
                }, 150);
            }
        }
        lastCallingNumbers = currentCallingNumbers;
    }

    function groupConsecutiveNumbers(numbers) {
        if (!numbers || numbers.length === 0) return '---';
        const sorted = [...new Set(numbers.map(Number))].sort((a, b) => a - b);
        let result = [], tempRange = [];
        for (const num of sorted) {
            if (tempRange.length === 0 || num === tempRange[tempRange.length - 1] + 1) {
                tempRange.push(num);
            } else { result.push(tempRange); tempRange = [num]; }
        }
        if (tempRange.length > 0) result.push(tempRange);
        return result.map(range => range.length >= 2 ? `${range[0]}-${range[range.length - 1]}` : range.join(', ')).join(', ');
    }
    
    // --- 音声関連の初期化 ---
    function initializeApp(audioEnabled) {
        isAudioEnabled = audioEnabled;
        localStorage.setItem('audioChoice', isAudioEnabled ? 'on' : 'off');

        audioUnlockOverlay.classList.add('hidden');
        audioToggleBtn.classList.remove('hidden');
        updateAudioToggleButton();
        
        if (isAudioEnabled) {
            // iOSの音声再生制限を解除するための「無音再生」
            const silentUtterance = new SpeechSynthesisUtterance(' ');
            speechSynthesis.speak(silentUtterance);
            
            const silentChime = new Audio('chime.mp3');
            silentChime.volume = 0;
            silentChime.play().catch(()=>{});
        }
    }
    
    function updateAudioToggleButton() {
        audioToggleBtn.textContent = isAudioEnabled ? '🔊 音声ON' : '🔇 音声OFF';
    }

    startWithAudioBtn.addEventListener('click', () => initializeApp(true));
    startWithoutAudioBtn.addEventListener('click', () => initializeApp(false));
    audioToggleBtn.addEventListener('click', () => {
        isAudioEnabled = !isAudioEnabled;
        localStorage.setItem('audioChoice', isAudioEnabled ? 'on' : 'off');
        updateAudioToggleButton();
    });

    const savedAudioChoice = localStorage.getItem('audioChoice');
    if (savedAudioChoice !== null) {
        initializeApp(savedAudioChoice === 'on');
    }
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            appStateRef.once('value').then(snapshot => {
                renderPatientView(snapshot.val() || { waiting: [], absent: [], completed: [] });
            });
        }
    });
});