document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const patientIdInput = document.getElementById('patient-id-input');
    const receptionNumInput = document.getElementById('reception-num-input');
    const registerBtn = document.getElementById('register-btn');
    const waitingList = document.getElementById('waiting-list');
    const absentList = document.getElementById('absent-list');
    const adminAlert = document.getElementById('admin-fullscreen-alert');
    const adminAlertText = document.getElementById('admin-alert-text');
    const resetDataBtn = document.getElementById('reset-data-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    // --- 変数定義 ---
    let draggedItem = null;
    let completedForDisplay = []; // 患者様画面表示用の完了「番号」リスト

    // --- イベントリスナー ---
    function enforceNumericInput(event) {
        event.target.value = event.target.value.replace(/[^0-9]/g, '');
    }
    patientIdInput.addEventListener('input', enforceNumericInput);
    receptionNumInput.addEventListener('input', enforceNumericInput);

    patientIdInput.addEventListener('input', (e) => {
        enforceNumericInput(e);
        if (e.target.value.length === 7) receptionNumInput.focus();
    });

    receptionNumInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            registerBtn.click();
        }
    });

    registerBtn.addEventListener('click', () => {
        const patientId = patientIdInput.value.trim();
        const receptionNum = receptionNumInput.value.trim();
        if (!receptionNum || Number(receptionNum) <= 0) {
            alert('受付番号は1以上の整数を入力してください。');
            return;
        }
        const allExistingNumbers = getAllNumbers();
        if (allExistingNumbers.has(receptionNum)) {
            alert(`受付番号「${receptionNum}」は既に使用されています。`);
            return;
        }
        if (patientId.length === 7 && /^\d+$/.test(patientId)) {
            addPatientToList(receptionNum, patientId, Date.now(), waitingList);
            patientIdInput.value = '';
            receptionNumInput.value = '';
            patientIdInput.focus();
        } else {
            alert('正しい患者ID (7桁) を入力してください。');
        }
    });

    resetDataBtn.addEventListener('click', () => {
        if (confirm('待機中・伝達事項リストの番号を全てリセットします。\n（CSV出力用の完了ログは消えません）。よろしいですか？')) {
            localStorage.removeItem('clinicCallAppState');
            location.reload();
        }
    });

    exportCsvBtn.addEventListener('click', exportToCSV);

    const today = new Date();
    const toISOStringWithTimezone = (date) => {
        const tzOffset = -date.getTimezoneOffset();
        const diff = tzOffset >= 0 ? '+' : '-';
        const pad = (n) => `${Math.floor(Math.abs(n))}`.padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    };
    endDateInput.value = toISOStringWithTimezone(today);
    startDateInput.value = toISOStringWithTimezone(today);

    [waitingList, absentList].forEach(list => {
        list.addEventListener('dragstart', (e) => {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        });
        list.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedItem) return;
            const targetList = e.currentTarget;
            const afterElement = getDragAfterElement(targetList, e.clientY);
            if (draggedItem.parentElement !== targetList) {
                targetList.appendChild(draggedItem);
                draggedItem.classList.remove('is-calling');
            } else {
                if (afterElement == null) {
                    targetList.appendChild(draggedItem);
                } else {
                    targetList.insertBefore(draggedItem, afterElement);
                }
            }
            updateListItemContent(draggedItem);
            updateAllViews();
        });
    });

    // --- 関数定義 ---
    function getAllNumbers() {
        const numbers = new Set();
        document.querySelectorAll('.patient-list li').forEach(item => numbers.add(item.dataset.num));
        completedForDisplay.forEach(num => numbers.add(String(num)));
        return numbers;
    }

    function addPatientToList(num, id, timestamp, targetList) {
        const listItem = document.createElement('li');
        listItem.dataset.num = num;
        listItem.dataset.id = id;
        listItem.dataset.timestamp = timestamp;
        listItem.draggable = true;
        targetList.appendChild(listItem);
        updateListItemContent(listItem);
        updateAllViews();
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return {
                    offset: offset,
                    element: child
                };
            } else {
                return closest;
            }
        }, {
            offset: Number.NEGATIVE_INFINITY
        }).element;
    }

    function updateListItemContent(item) {
        const num = item.dataset.num;
        const id = item.dataset.id;
        let buttonsHtml = '';
        if (item.parentElement === absentList) {
            buttonsHtml = `<button class="recall-btn">待機へ</button><button class="complete-btn">完了</button><button class="cancel-btn">受付解除</button>`;
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
        item.querySelector('.call-btn')?.addEventListener('click', () => callPatient(item));
        item.querySelector('.recall-btn')?.addEventListener('click', () => moveToWaiting(item));
        item.querySelector('.complete-btn')?.addEventListener('click', () => completePatient(item));
        item.querySelector('.info-num.editable')?.addEventListener('click', () => editNumber(item));
        item.querySelector('.cancel-btn')?.addEventListener('click', () => cancelReception(item));
        item.querySelector('.absent-btn')?.addEventListener('click', () => moveToAbsent(item));
    }

    function editNumber(item) {
        const currentNum = item.dataset.num;
        const newNum = prompt(`新しい受付番号を入力してください (現在: ${currentNum})`, currentNum);
        if (newNum === null || newNum.trim() === '') return;
        if (Number(newNum) <= 0 || !/^\d+$/.test(newNum)) {
            alert('受付番号は1以上の整数を入力してください。');
            return;
        }
        const allNumbers = getAllNumbers();
        allNumbers.delete(currentNum);
        if (allNumbers.has(newNum)) {
            alert(`受付番号「${newNum}」は既に使用されています。`);
            return;
        }
        item.dataset.num = newNum;
        updateListItemContent(item);
        updateAllViews();
    }

    function callPatient(item) {
        item.classList.add('is-calling');
        waitingList.prepend(item);
        updateListItemContent(item);
        adminAlertText.innerHTML = `<span class="highlight">${item.dataset.num}番 を呼び出し中です</span>`;
        adminAlert.classList.remove('hidden');
        setTimeout(() => {
            adminAlert.classList.add('hidden');
        }, 10000);
        updateAllViews();
    }

    function moveToWaiting(item) {
        item.classList.remove('is-calling');
        waitingList.appendChild(item);
        updateListItemContent(item);
        updateAllViews();
    }

    function moveToAbsent(item) {
        item.classList.remove('is-calling');
        absentList.appendChild(item);
        updateListItemContent(item);
        updateAllViews();
    }

    function completePatient(item) {
        const completedPatientData = {
            num: item.dataset.num,
            id: item.dataset.id,
            registrationTimestamp: item.dataset.timestamp,
            completionTimestamp: Date.now()
        };

        let completionLog = JSON.parse(localStorage.getItem('clinicCompletionLog')) || [];
        completionLog.push(completedPatientData);
        localStorage.setItem('clinicCompletionLog', JSON.stringify(completionLog));

        if (!completedForDisplay.includes(Number(completedPatientData.num))) {
            completedForDisplay.push(Number(completedPatientData.num));
        }

        item.remove();
        updateAllViews();
    }

    function cancelReception(item) {
        if (confirm(`番号「${item.dataset.num}」の受付を解除しますか？\nこの操作は元に戻せません。`)) {
            item.remove();
            updateAllViews();
        }
    }

    function exportToCSV() {
        const startDate = new Date(startDateInput.value);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(endDateInput.value);
        endDate.setHours(23, 59, 59, 999);

        const completionLog = JSON.parse(localStorage.getItem('clinicCompletionLog')) || [];
        const filteredLog = completionLog.filter(item => {
            const completionTime = new Date(item.completionTimestamp);
            return completionTime >= startDate && completionTime <= endDate;
        });

        if (filteredLog.length === 0) {
            alert('指定された期間に完了した患者さんのデータはありません。');
            return;
        }

        let csvContent = '"受付番号","患者ID","受付日","受付時刻","完了日","完了時刻"\n';
        filteredLog.forEach(item => {
            const regDate = new Date(Number(item.registrationTimestamp));
            const compDate = new Date(item.completionTimestamp);
            const row = [
                item.num,
                item.id,
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
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function updateAllViews() {
        function getListItems(listElement) {
            return [...listElement.children].map(item => ({
                num: item.dataset.num,
                id: item.dataset.id,
                timestamp: item.dataset.timestamp,
                isCalling: item.classList.contains('is-calling')
            }));
        }
        const appState = {
            waiting: getListItems(waitingList),
            absent: getListItems(absentList),
            completed: completedForDisplay
        };
        localStorage.setItem('clinicCallAppState', JSON.stringify(appState));
    }

    function loadStateFromLocalStorage() {
        const storedStateJSON = localStorage.getItem('clinicCallAppState');
        if (!storedStateJSON) return;
        const storedState = JSON.parse(storedStateJSON);
        if (!storedState) return;
        
        if (storedState.waiting) {
            storedState.waiting.forEach(itemData => {
                addPatientToList(itemData.num, itemData.id, itemData.timestamp, waitingList);
            });
        }
        if (storedState.absent) {
            storedState.absent.forEach(itemData => {
                addPatientToList(itemData.num, itemData.id, itemData.timestamp, absentList);
            });
        }
        
        document.querySelectorAll('#waiting-list li').forEach(li => {
            const waitingItemData = storedState.waiting?.find(item => item.num === li.dataset.num);
            if (waitingItemData && waitingItemData.isCalling) {
                li.classList.add('is-calling');
                updateListItemContent(li);
            }
        });
        
        completedForDisplay = storedState.completed || [];
        updateAllViews();
    }
    
    loadStateFromLocalStorage();
});