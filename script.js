document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const patientIdInput = document.getElementById('patient-id-input');
    const receptionNumInput = document.getElementById('reception-num-input');
    const registerBtn = document.getElementById('register-btn');
    const waitingList = document.getElementById('waiting-list');
    const absentList = document.getElementById('absent-list');
    const resetDataBtn = document.getElementById('reset-data-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const adminAlert = document.getElementById('admin-fullscreen-alert');
    const adminAlertText = document.getElementById('admin-alert-text');

    // --- Firebaseデータベースへの参照 ---
    const db = firebase.database();
    const appStateRef = db.ref('appState');
    const completionLogRef = db.ref('completionLog');

    // --- 変数定義 ---
    let appState = { waiting: [], absent: [], completed: [] };
    let draggedItem = null;

    // --- Firebaseからデータを読み込み、変更を監視 ---
    appStateRef.on('value', (snapshot) => {
        appState = snapshot.val() || { waiting: [], absent: [], completed: [] };
        renderAllLists();
    });

    function renderAllLists() {
        waitingList.innerHTML = '';
        absentList.innerHTML = '';
        (appState.waiting || []).forEach(itemData => createListItem(itemData, waitingList));
        (appState.absent || []).forEach(itemData => createListItem(itemData, absentList));
    }

    function createListItem(itemData, targetList) {
        const listItem = document.createElement('li');
        listItem.dataset.num = itemData.num;
        listItem.dataset.id = itemData.id;
        listItem.dataset.timestamp = itemData.timestamp;
        if(itemData.isCalling) {
            listItem.classList.add('is-calling');
        }
        listItem.draggable = true;
        targetList.appendChild(listItem);
        updateListItemContent(listItem);
    }
    
    function updateDatabase() {
        function getListItems(listElement) {
            return [...listElement.children].map(item => ({
                num: item.dataset.num, id: item.dataset.id, timestamp: item.dataset.timestamp,
                isCalling: item.classList.contains('is-calling')
            }));
        }
        const newState = {
            waiting: getListItems(waitingList),
            absent: getListItems(absentList),
            completed: appState.completed || []
        };
        appStateRef.set(newState);
    }
    
    // --- イベントリスナー ---
    function enforceNumericInput(event) { event.target.value = event.target.value.replace(/[^0-9]/g, ''); }
    patientIdInput.addEventListener('input', enforceNumericInput);
    receptionNumInput.addEventListener('input', enforceNumericInput);

    patientIdInput.addEventListener('input', (e) => {
        if (e.target.value.length === 7) {
            receptionNumInput.focus();
        }
    });

    receptionNumInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            registerBtn.click();
        }
    });

    registerBtn.addEventListener('click', () => {
        const num = receptionNumInput.value.trim();
        const id = patientIdInput.value.trim();

        if (!num || Number(num) <= 0) {
            alert('受付番号は1以上の整数を入力してください。'); return;
        }
        if (id.length !== 7 || !/^\d+$/.test(id)) {
            alert('正しい患者ID (7桁) を入力してください。'); return;
        }
        const allCurrentNumbers = [...(appState.waiting || []), ...(appState.absent || [])].map(p => p.num);
        if (allCurrentNumbers.includes(num)) {
            alert(`受付番号「${num}」は既に使用されています。`); return;
        }

        const newPatient = { num, id, timestamp: Date.now(), isCalling: false };
        const newWaitingList = [...(appState.waiting || []), newPatient];
        appStateRef.child('waiting').set(newWaitingList);

        patientIdInput.value = '';
        receptionNumInput.value = '';
        patientIdInput.focus();
    });
    
    resetDataBtn.addEventListener('click', () => {
        if (confirm('待機中・伝達事項リストの番号を全てリセットします。\n（CSV出力用の完了ログは消えません）。よろしいですか？')) {
            appStateRef.set({ waiting: [], absent: [], completed: [] });
        }
    });

    exportCsvBtn.addEventListener('click', exportToCSV);

    const today = new Date();
    const toISOStringWithTimezone = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    endDateInput.value = toISOStringWithTimezone(today);
    startDateInput.value = toISOStringWithTimezone(today);

    // --- ドラッグ＆ドロップ機能 ---
    [waitingList, absentList].forEach(list => {
        list.addEventListener('dragstart', (e) => {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        });
        list.addEventListener('dragend', (e) => { e.target.classList.remove('dragging'); });
        list.addEventListener('dragover', (e) => { e.preventDefault(); });
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedItem) return;
            const targetList = e.currentTarget;
            const afterElement = getDragAfterElement(targetList, e.clientY);
            if (draggedItem.parentElement !== targetList) {
                targetList.appendChild(draggedItem);
                draggedItem.classList.remove('is-calling');
            } else {
                if (afterElement == null) { targetList.appendChild(draggedItem); }
                else { targetList.insertBefore(draggedItem, afterElement); }
            }
            updateListItemContent(draggedItem);
            updateDatabase();
        });
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // --- UI更新とボタン操作 ---
    function updateListItemContent(item) {
        const num = item.dataset.num, id = item.dataset.id;
        let buttonsHtml = '';
        if (item.parentElement === absentList) {
            // 修正点: 「受付取消」ボタンを追加
            buttonsHtml = `<button class="recall-btn">待機へ</button><button class="complete-btn">完了</button><button class="cancel-btn">受付取消</button>`;
        } else if (item.classList.contains('is-calling')) {
            buttonsHtml = `<button class="complete-btn">完了</button><button class="absent-btn">伝達事項へ</button>`;
        } else {
            buttonsHtml = `<button class="call-btn">呼出</button><button class="complete-btn">完了</button>`;
        }
        item.innerHTML = `<div class="handle">≡</div>
            <div class="patient-info"><span class="info-num editable">${num}番</span><span class="info-id">ID: ${id}</span></div>
            <div class="buttons">${buttonsHtml}</div>`;
        addButtonListeners(item);
    }

    function addButtonListeners(item) {
        item.querySelector('.info-num.editable')?.addEventListener('click', () => editNumber(item));
        item.querySelector('.call-btn')?.addEventListener('click', () => callPatient(item));
        item.querySelector('.complete-btn')?.addEventListener('click', () => completePatient(item));
        item.querySelector('.absent-btn')?.addEventListener('click', () => moveToAbsent(item));
        item.querySelector('.recall-btn')?.addEventListener('click', () => moveToWaiting(item));
        // 修正点: 「受付取消」ボタンのイベントリスナーを追加
        item.querySelector('.cancel-btn')?.addEventListener('click', () => cancelReception(item));
    }

    function editNumber(item) {
        const currentNum = item.dataset.num;
        const newNum = prompt(`新しい受付番号を入力してください (現在: ${currentNum})`, currentNum);
        if (newNum === null || newNum.trim() === '') return;
        if (Number(newNum) <= 0 || !/^\d+$/.test(newNum)) {
            alert('受付番号は1以上の整数を入力してください。'); return;
        }

        const patient = (appState.waiting || []).find(p => p.num === currentNum) || (appState.absent || []).find(p => p.num === currentNum);
        if(patient) {
            patient.num = newNum;
            appStateRef.set(appState);
        }
    }

    function callPatient(item) {
        let patient = (appState.waiting || []).find(p => p.num === item.dataset.num);
        if (patient) {
            patient.isCalling = true;
            appStateRef.set(appState);

            adminAlertText.innerHTML = `<span class="highlight">${patient.num}番 を呼び出し中です</span>`;
            adminAlert.classList.remove('hidden');
            setTimeout(() => adminAlert.classList.add('hidden'), 5000);
        }
    }

    function completePatient(item) {
        const num = item.dataset.num;
        const patientData = (appState.waiting || []).find(p => p.num === num) || (appState.absent || []).find(p => p.num === num);
        
        if(!patientData) return;

        const completedPatientData = {
            num: patientData.num, id: patientData.id, registrationTimestamp: patientData.timestamp,
            completionTimestamp: firebase.database.ServerValue.TIMESTAMP
        };
        completionLogRef.push(completedPatientData);

        const completedNum = Number(completedPatientData.num);
        if (!appState.completed) appState.completed = [];
        if (!appState.completed.includes(completedNum)) {
            appState.completed.push(completedNum);
        }
        
        appState.waiting = (appState.waiting || []).filter(p => p.num !== num);
        appState.absent = (appState.absent || []).filter(p => p.num !== num);
        appStateRef.set(appState);
    }
    
    function moveToAbsent(item) {
        let patient = (appState.waiting || []).find(p => p.num === item.dataset.num);
        if (patient) {
            patient.isCalling = false;
            if (!appState.absent) appState.absent = [];
            appState.absent.push(patient);
            appState.waiting = appState.waiting.filter(p => p.num !== patient.num);
            appStateRef.set(appState);
        }
    }
    
    function moveToWaiting(item) {
        let patient = (appState.absent || []).find(p => p.num === item.dataset.num);
        if (patient) {
            if (!appState.waiting) appState.waiting = [];
            appState.waiting.push(patient);
            appState.absent = appState.absent.filter(p => p.num !== patient.num);
            appStateRef.set(appState);
        }
    }
    
    // 修正点: 受付取消機能を実装
    function cancelReception(item) {
        const num = item.dataset.num;
        if (confirm(`番号「${num}」の受付を完全に削除しますか？\nこの操作は元に戻せません。`)) {
            appState.waiting = (appState.waiting || []).filter(p => p.num !== num);
            appState.absent = (appState.absent || []).filter(p => p.num !== num);
            // 完了リストからも削除（念のため）
            appState.completed = (appState.completed || []).filter(n => n !== Number(num));
            
            appStateRef.set(appState);
        }
    }

    function exportToCSV() {
        const startDate = new Date(startDateInput.value);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(endDateInput.value);
        endDate.setHours(23, 59, 59, 999);

        completionLogRef.once('value').then((snapshot) => {
            const completionLogData = snapshot.val();
            if (!completionLogData) {
                alert('完了ログがありません。'); return;
            }
            const filteredLog = Object.values(completionLogData).filter(item => {
                const completionTime = new Date(item.completionTimestamp);
                return completionTime >= startDate && completionTime <= endDate;
            });

            if (filteredLog.length === 0) {
                alert('指定された期間に完了した患者さんのデータはありません。'); return;
            }

            let csvContent = '"受付番号","患者ID","受付日","受付時刻","完了日","完了時刻"\n';
            filteredLog.forEach(item => {
                const regDate = new Date(Number(item.registrationTimestamp));
                const compDate = new Date(item.completionTimestamp);
                const row = [
                    item.num, item.id,
                    regDate.toLocaleDateString('ja-JP'),
                    regDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    compDate.toLocaleDateString('ja-JP'),
                    compDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                ].map(val => `"${val}"`).join(',');
                csvContent += row + '\n';
            });

            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `会計完了ログ_${startDateInput.value}_to_${endDateInput.value}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }
});