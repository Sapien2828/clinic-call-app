document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const completedNumbersDiv = document.getElementById('patient-completed-numbers');
    // ... (他の要素取得は前回のコードと同じ)
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
        // ... (この関数の中身は前回のコードとほぼ同じ)
        
        const newCalls = [...currentCallingNumbers].filter(num => !lastCallingNumbers.has(num));
        if (newCalls.length > 0) {
            const newCallNumber = newCalls[0];
            patientAlertText.innerHTML = `<span class="highlight">${newCallNumber}番</span>`;
            patientAlert.classList.remove('hidden');
            setTimeout(() => patientAlert.classList.add('hidden'), 10000);

            if (isAudioEnabled) {
                // 修正点: iOSで音声合成がブロックされないように、合成を先に開始し、少し遅れてチャイムを鳴らす
                const utterance = new SpeechSynthesisUtterance(`${newCallNumber}番のかた、会計の準備が整いました。フロア受付までお越しください。`);
                utterance.lang = 'ja-JP';
                speechSynthesis.speak(utterance);
                
                setTimeout(() => {
                    chimeSound.play().catch(e => console.error("チャイム再生に失敗:", e));
                }, 150); // 0.15秒遅延
            }
        }
        lastCallingNumbers = currentCallingNumbers;
    }

    // --- 音声関連の初期化 ---
    function initializeApp(audioEnabled) {
        isAudioEnabled = audioEnabled;
        audioUnlockOverlay.classList.add('hidden');
        audioToggleBtn.classList.remove('hidden');
        updateAudioToggleButton();
        if (isAudioEnabled) {
            // iOSの音声再生制限を解除するための「無音再生」
            const silentUtterance = new SpeechSynthesisUtterance(' ');
            silentUtterance.volume = 0;
            speechSynthesis.speak(silentUtterance);

            chimeSound.volume = 0;
            chimeSound.play().catch(() => {});
            chimeSound.volume = 1;
        }
        localStorage.setItem('audioChoice', isAudioEnabled ? 'on' : 'off');
    }
    
    // ... (他の関数は前回のコードと同じ)
});