const state = {
    allQuizzes: [],           // loaded from selected dataset
    wrongQuizzes: [],         // loaded from wrong_quizzes.json
    savedQuizzes: [],         // quiz salvati in corso
    flatPool: [],             // questions for current run
    answers: {},              // qId -> Set of selected indexes
    graded: {},               // qId -> { correct: bool, wrongIndexes: [], missingIndexes: [] }
    order: [],                // sequence of qIds
    choicesOrder: {},         // qId -> array of shuffled choice indexes
    idx: 0,                   // current index within order
    mode: "idle",             // idle|running|finished
    lastRunWrongIds: [],
    currentSetLabel: "",
    availableDatasets: [],    // available quiz files
    currentDataset: "",       // currently loaded dataset
};

const el = (id) => document.getElementById(id);
const setHidden = (node, hidden) => node.classList.toggle("hidden", hidden);

function showModal(message, { title = "Avviso", confirmLabel = "OK", showCancel = false } = {}) {
    const modalElement = el("messageModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    const confirmButton = el("messageModalConfirm");
    const cancelButton = el("messageModalCancel");

    el("messageModalLabel").textContent = title;
    el("messageModalBody").textContent = message;
    confirmButton.textContent = confirmLabel;
    cancelButton.classList.toggle("d-none", !showCancel);

    return new Promise(resolve => {
        const finish = (result) => {
            confirmButton.removeEventListener("click", onConfirm);
            cancelButton.removeEventListener("click", onCancel);
            modalElement.removeEventListener("hidden.bs.modal", onDismiss);
            resolve(result);
        };
        const onConfirm = () => {
            modal.hide();
            finish(true);
        };
        const onCancel = () => {
            modal.hide();
            finish(false);
        };
        const onDismiss = () => finish(false);

        confirmButton.addEventListener("click", onConfirm);
        cancelButton.addEventListener("click", onCancel);
        modalElement.addEventListener("hidden.bs.modal", onDismiss, { once: true });
        modal.show();
    });
}

function setTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");

    const themeToggle = el("themeToggle");
    const themeToggleIcon = el("themeToggleIcon");
    if (themeToggle) {
        themeToggle.checked = isDark;
    }
    if (themeToggleIcon) {
        themeToggleIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem("quizTheme") === "dark" ? "dark" : "light";
    setTheme(savedTheme);

    el("themeToggle").addEventListener("change", (event) => {
        const nextTheme = event.target.checked ? "dark" : "light";
        setTheme(nextTheme);
        localStorage.setItem("quizTheme", nextTheme);
    });
}

// ==========================================
// DATASET & STORAGE MANAGEMENT
// ==========================================

async function loadAvailableDatasets() {
    state.availableDatasets = [
        {
            name: "quizzes_aspetti.json",
            title: "Aspetti economici, etici, sociali e legali (F680N-)",
            description: "Domande su Aspetti economici, etici, sociali e legali connessi allo svolgimento della professione informatica."
        },
        {
            name: "quizzes_sisbio.json",
            title: "Sistemi biometrici (F680R-)",
            description: "Domande su Sistemi biometrici."
        },
        {
            name: "quiz_compBiometria.json",
            title: "Complementi di biometria (F2Y0F-)",
            description: "Domande su Complementi di biometria."
        },
        {
            name: "quiz_industrial.json",
            title: "Industrial Systems",
            description: "Domande su industrial systems."
        }
    ];

    populateDatasetDropdown();

    if (state.availableDatasets.length > 0) {
        const firstDataset = state.availableDatasets[0].name;
        el("datasetSelect").value = firstDataset;
        await loadQuizzes(firstDataset);
    }
}

function populateDatasetDropdown() {
    const sel = el("datasetSelect");
    sel.innerHTML = "";

    state.availableDatasets.forEach(dataset => {
        const opt = document.createElement("option");
        opt.value = dataset.name;
        opt.textContent = dataset.title;
        sel.appendChild(opt);
    });
}

async function loadQuizzes(datasetFile) {
    if (!datasetFile) {
        state.allQuizzes = [];
        state.currentDataset = "";
        populateDropdown();
        updateSetInfo();
        return;
    }

    try {
        const res = await fetch(`quizzes/${datasetFile}`);
        if (!res.ok) {
            throw new Error(`Errore HTTP! status: ${res.status}`);
        }
        const data = await res.json();
        state.allQuizzes = data.quizzes;
        state.currentDataset = datasetFile;

        await loadWrongQuizzes();
        await loadSavedQuizzes();

        populateDropdown();
        updateSetInfo();
        updateDatasetInfo();
    } catch (error) {
        console.error('Errore nel caricamento del dataset:', error);
        showModal(`Errore nel caricamento del dataset: ${error.message}`);
        state.allQuizzes = [];
        state.currentDataset = "";
        populateDropdown();
        updateSetInfo();
    }
}

function updateDatasetInfo() {
    const dataset = state.availableDatasets.find(d => d.name === state.currentDataset);
    if (dataset) {
        el("datasetInfo").textContent = dataset.description;
    } else {
        el("datasetInfo").textContent = "";
    }
}

async function loadWrongQuizzes() {
    try {
        const localData = localStorage.getItem('wrongQuizzes');
        if (localData) {
            const data = JSON.parse(localData);
            state.wrongQuizzes = data.quizzes || [];
            console.log(`Caricati ${state.wrongQuizzes.length} quiz di errori dal localStorage`);
            return;
        }

        const res = await fetch("wrong_quizzes.json");
        if (res.ok) {
            const data = await res.json();
            state.wrongQuizzes = data.quizzes || [];
            console.log(`Caricati ${state.wrongQuizzes.length} quiz di errori dal file`);
        }
    } catch (error) {
        state.wrongQuizzes = [];
        console.log('Nessun file di quiz sbagliati trovato, inizializzazione vuota');
    }
}

async function loadSavedQuizzes() {
    try {
        const localData = localStorage.getItem('savedQuizzes');
        if (localData) {
            const data = JSON.parse(localData);
            state.savedQuizzes = data.quizzes || [];
            console.log(`Caricati ${state.savedQuizzes.length} quiz salvati dal localStorage`);
        }
    } catch (error) {
        state.savedQuizzes = [];
        console.log('Nessun quiz salvato trovato');
    }
}

function populateDropdown() {
    const sel = el("setSelect");
    while (sel.children.length > 1) {
        sel.removeChild(sel.lastChild);
    }

    state.allQuizzes.forEach(qz => {
        const opt = document.createElement("option");
        opt.value = qz.id;
        opt.textContent = qz.title;
        sel.appendChild(opt);
    });

    const errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
    if (errorsQuiz && errorsQuiz.questions.length > 0) {
        const separator = document.createElement("option");
        separator.disabled = true;
        separator.textContent = "— Domande Sbagliate —";
        sel.appendChild(separator);

        const opt = document.createElement("option");
        opt.value = 'unified_errors';
        opt.textContent = `[ERR] Domande Sbagliate (${errorsQuiz.questions.length})`;
        sel.appendChild(opt);
    }

    if (state.savedQuizzes.length > 0) {
        const separator = document.createElement("option");
        separator.disabled = true;
        separator.textContent = "— Quiz Salvati —";
        sel.appendChild(separator);

        state.savedQuizzes.forEach(savedQuiz => {
            const opt = document.createElement("option");
            opt.value = `saved_${savedQuiz.id}`;
            opt.textContent = `[SAVE] ${savedQuiz.name} (${savedQuiz.progress}/${savedQuiz.total})`;
            sel.appendChild(opt);
        });
    }
}

// ==========================================
// QUIZ RUN & STATE MANAGEMENT
// ==========================================

async function saveWrongQuestions(wrongQuestions) {
    if (wrongQuestions.length === 0) return;

    let errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
    if (!errorsQuiz) {
        errorsQuiz = {
            id: 'unified_errors',
            title: 'Domande Sbagliate',
            questions: []
        };
        state.wrongQuizzes.push(errorsQuiz);
    }

    let addedCount = 0;

    wrongQuestions.forEach((q, index) => {
        const isDuplicate = errorsQuiz.questions.some(existingQ => 
            existingQ.text === q.text && existingQ.originalQuiz === q.quizTitle
        );

        if (!isDuplicate) {
            const newQuestion = {
                id: `error_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
                text: q.text,
                choices: q.choices,
                correctIndexes: q.correctIndexes,
                originalQuiz: q.quizTitle
            };
            errorsQuiz.questions.push(newQuestion);
            addedCount++;
        }
    });

    localStorage.setItem('wrongQuizzes', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        quizzes: state.wrongQuizzes
    }));

    populateDropdown();
    return addedCount;
}

function removeCorrectAnswersFromWrongQuizzes(correctQuestions) {
    if (correctQuestions.length === 0) return 0;

    const errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
    if (!errorsQuiz) return 0;

    let removedCount = 0;

    errorsQuiz.questions = errorsQuiz.questions.filter(errorQ => {
        const shouldRemove = correctQuestions.some(correctQ => 
            correctQ.text === errorQ.text && correctQ.quizTitle === errorQ.originalQuiz
        );
        if (shouldRemove) removedCount++;
        return !shouldRemove;
    });

    if (removedCount > 0) {
        localStorage.setItem('wrongQuizzes', JSON.stringify({
            lastUpdated: new Date().toISOString(),
            quizzes: state.wrongQuizzes
        }));
        populateDropdown();
    }

    return removedCount;
}

function saveCurrentQuiz() {
    if (state.mode !== "running") return;

    const currentSet = el("setSelect").value;
    const quizName = `${state.currentSetLabel} - ${new Date().toLocaleDateString()}`;
    
    const savedQuiz = {
        id: `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: quizName,
        dataset: state.currentDataset,
        setSelection: currentSet,
        flatPool: state.flatPool,
        answers: Object.fromEntries(
            Object.entries(state.answers).map(([k, v]) => [k, Array.from(v)])
        ),
        graded: state.graded,
        order: state.order,
        choicesOrder: state.choicesOrder,
        idx: state.idx,
        progress: state.idx + 1,
        total: state.order.length,
        savedAt: new Date().toISOString()
    };

    state.savedQuizzes.push(savedQuiz);

    localStorage.setItem('savedQuizzes', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        quizzes: state.savedQuizzes
    }));

    populateDropdown();
    return savedQuiz.name;
}

function loadSavedQuiz(savedQuizId) {
    const savedQuiz = state.savedQuizzes.find(q => q.id === savedQuizId);
    if (!savedQuiz) return false;

    state.flatPool = savedQuiz.flatPool;
    state.answers = Object.fromEntries(
        Object.entries(savedQuiz.answers).map(([k, v]) => [k, new Set(v)])
    );
    state.graded = savedQuiz.graded;
    state.order = savedQuiz.order;
    state.choicesOrder = savedQuiz.choicesOrder;
    state.idx = savedQuiz.idx;
    state.mode = "running";
    state.currentSetLabel = savedQuiz.name;

    setHidden(el("quizArea"), false);
    setHidden(el("resultArea"), true);
    el("btnPrev").disabled = (state.idx === 0);
    createNavigationBar();
    renderCurrent();

    return true;
}

function removeSavedQuiz(savedQuizId) {
    state.savedQuizzes = state.savedQuizzes.filter(q => q.id !== savedQuizId);
    
    localStorage.setItem('savedQuizzes', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        quizzes: state.savedQuizzes
    }));

    populateDropdown();
}

async function clearSavedQuizzes() {
    const totalSaved = state.savedQuizzes.length;
    if (totalSaved === 0) {
        await showModal("Non ci sono quiz salvati da cancellare.");
        return;
    }

    if (await showModal(`Sei sicuro di voler cancellare tutti i ${totalSaved} quiz salvati?`, {
        title: "Conferma cancellazione",
        confirmLabel: "Cancella",
        showCancel: true
    })) {
        state.savedQuizzes = [];
        localStorage.removeItem('savedQuizzes');
        populateDropdown();
        updateSetInfo();

        showAlertMessage(`Tutti i ${totalSaved} quiz salvati sono stati cancellati.`);
    }
}

async function clearWrongQuizzes() {
    const errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
    const totalErrors = errorsQuiz?.questions.length || 0;

    if (totalErrors === 0) {
        await showModal("Non ci sono domande sbagliate da cancellare.");
        return;
    }

    if (await showModal(`Sei sicuro di voler cancellare tutte le ${totalErrors} domande sbagliate?`, {
        title: "Conferma cancellazione",
        confirmLabel: "Cancella",
        showCancel: true
    })) {
        state.wrongQuizzes = [];
        localStorage.removeItem('wrongQuizzes');
        populateDropdown();
        updateSetInfo();

        showAlertMessage(`Tutte le ${totalErrors} domande sbagliate sono state cancellate.`);
    }
}

function showAlertMessage(msg) {
    const alert = document.createElement("div");
    alert.className = "alert alert-success alert-dismissible fade show mt-2";
    alert.innerHTML = `<i class="fas fa-trash"></i> ${msg} <button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    el("setInfo").parentElement.appendChild(alert);

    setTimeout(() => {
        if (alert.parentElement) {
            alert.parentElement.removeChild(alert);
        }
    }, 3000);
}

function updateSetInfo() {
    const selVal = el("setSelect").value;
    let total = 0;

    if (selVal === "all") {
        state.allQuizzes.forEach(qz => total += qz.questions.length);
        el("setInfo").textContent = `Tutti i quiz uniti • ${total} domande`;
        state.currentSetLabel = "Tutti i quiz";
    } else if (selVal === "unified_errors") {
        const errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
        total = errorsQuiz?.questions.length || 0;
        el("setInfo").textContent = `Domande sbagliate da tutti i quiz • ${total} domande`;
        state.currentSetLabel = "Domande Sbagliate";
    } else if (selVal.startsWith("saved_")) {
        const savedQuizId = selVal.replace("saved_", "");
        const savedQuiz = state.savedQuizzes.find(q => q.id === savedQuizId);
        if (savedQuiz) {
            el("setInfo").textContent = `Quiz salvato • Progresso: ${savedQuiz.progress}/${savedQuiz.total} domande`;
            state.currentSetLabel = savedQuiz.name;
            total = savedQuiz.total;
        }
    } else {
        const qz = state.allQuizzes.find(q => q.id === selVal);
        total = qz?.questions.length || 0;
        el("setInfo").textContent = `${qz?.title || ""} • ${total} domande`;
        state.currentSetLabel = qz?.title || "";
    }
    el("totalCounter").textContent = `${total} domande`;
}

function buildPool(selVal) {
    const pool = [];
    if (selVal === "all") {
        state.allQuizzes.forEach(qz => {
            qz.questions.forEach(q => pool.push({ ...q, quizTitle: qz.title }));
        });
    } else if (selVal === "unified_errors") {
        const errorsQuiz = state.wrongQuizzes.find(q => q.id === 'unified_errors');
        if (errorsQuiz) {
            errorsQuiz.questions.forEach(q => pool.push({
                ...q,
                quizTitle: q.originalQuiz || "Errori"
            }));
        }
    } else if (selVal.startsWith("saved_")) {
        return [];
    } else {
        const qz = state.allQuizzes.find(q => q.id === selVal);
        if (qz) {
            qz.questions.forEach(q => pool.push({ ...q, quizTitle: qz.title }));
        }
    }
    return pool;
}

function startRun(fromWrong = false) {
    state.answers = {};
    state.graded = {};
    state.choicesOrder = {};
    state.idx = 0;
    state.mode = "running";

    if (fromWrong) {
        const idset = new Set(state.lastRunWrongIds);
        const pool = [];
        state.allQuizzes.forEach(qz => {
            qz.questions.forEach(q => { if (idset.has(q.id)) pool.push({ ...q, quizTitle: qz.title }); });
        });
        state.flatPool = pool;
        state.order = pool.map(q => q.id);
        state.currentSetLabel = "Ripasso errori";
    } else {
        const selVal = el("setSelect").value;
        state.flatPool = buildPool(selVal);
        state.order = state.flatPool.map(q => q.id);
    }

    if (el("shuffleCheckbox").checked) {
        for (let i = state.order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
        }
    }

    state.flatPool.forEach(q => {
        const choicesIndexes = Array.from({ length: q.choices.length }, (_, i) => i);
        for (let i = choicesIndexes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [choicesIndexes[i], choicesIndexes[j]] = [choicesIndexes[j], choicesIndexes[i]];
        }
        state.choicesOrder[q.id] = choicesIndexes;
    });

    setHidden(el("quizArea"), false);
    setHidden(el("resultArea"), true);
    el("btnPrev").disabled = true;
    createNavigationBar();
    renderCurrent();
}

function getCurrent() {
    const id = state.order[state.idx];
    return state.flatPool.find(q => q.id === id);
}

// ==========================================
// NAVIGATION & UI RENDERING
// ==========================================

function createNavigationBar() {
    const container = el("questionNumbers");
    container.innerHTML = "";

    state.order.forEach((questionId, index) => {
        const button = document.createElement("button");
        button.className = "btn question-number";
        button.textContent = index + 1;
        button.title = `Vai alla domanda ${index + 1}`;

        button.addEventListener("click", () => {
            const currentQ = getCurrent();
            if (currentQ && state.answers[currentQ.id] && state.answers[currentQ.id].size > 0) {
                const g = gradeQuestion(currentQ);
                showGradeOnUI(currentQ, g);
            }
            
            state.idx = index;
            renderCurrent();
            updateNavigationBar();
            scrollNavbarToButton(button);
        });

        container.appendChild(button);
    });

    updateNavigationBar();
}

function scrollNavbarToButton(button) {
    setTimeout(() => {
        const container = document.querySelector('.navigation-container');
        const grid = el("questionNumbers");
        if (button && container && grid) {
            const gridStyles = window.getComputedStyle(grid);
            const gridTemplateColumns = gridStyles.gridTemplateColumns.split(' ').length;
            const buttonIndex = Array.from(grid.children).indexOf(button);
            const buttonRow = Math.floor(buttonIndex / gridTemplateColumns);
            
            const buttonHeight = button.offsetHeight;
            const gap = parseInt(gridStyles.gap) || 4;
            const rowHeight = buttonHeight + gap;
            
            const rowCenterY = (buttonRow * rowHeight) + (buttonHeight / 2);
            const containerStyles = window.getComputedStyle(container);
            const paddingTop = parseInt(containerStyles.paddingTop) || 0;
            
            const containerHeight = container.clientHeight;
            const scrollPosition = rowCenterY + paddingTop - (containerHeight / 2);
            
            container.scrollTo({
                top: Math.max(0, scrollPosition),
                behavior: 'smooth'
            });
        }
    }, 100);
}

function updateNavigationBar() {
    const buttons = el("questionNumbers").querySelectorAll(".question-number");
    const showErrors = el("showErrorsCheckbox").checked;

    buttons.forEach((button, index) => {
        const questionId = state.order[index];
        button.classList.remove("current", "answered", "correct", "wrong");

        if (index === state.idx) {
            button.classList.add("current");
        }

        if (state.answers[questionId] && state.answers[questionId].size > 0) {
            button.classList.add("answered");

            if (state.graded[questionId] !== undefined && showErrors) {
                button.classList.remove("answered");
                if (state.graded[questionId].correct) {
                    button.classList.add("correct");
                } else {
                    button.classList.add("wrong");
                }
            }
        }
    });
}

function renderCurrent() {
    const q = getCurrent();
    el("qText").innerHTML = q.text;
    el("quizBadge").textContent = q.quizTitle;
    el("progressLabel").textContent = `Domanda ${state.idx + 1} / ${state.order.length}`;
    
    updateProgressBar();

    const multiple = (q.correctIndexes.length > 1);
    const choicesDiv = el("choices");
    choicesDiv.innerHTML = "";

    const shuffledIndexes = state.choicesOrder[q.id] || Array.from({ length: q.choices.length }, (_, i) => i);

    shuffledIndexes.forEach((originalIdx, displayIdx) => {
        const ch = q.choices[originalIdx];
        const wrap = document.createElement("div");
        wrap.className = "card choice";
        const body = document.createElement("div");
        body.className = "card-body py-2";

        const input = document.createElement("input");
        input.type = multiple ? "checkbox" : "radio";
        input.className = "form-check-input";
        input.name = multiple ? `checkbox_${q.id}` : `radio_${q.id}`;
        input.id = `ch_${displayIdx}`;
        input.value = originalIdx;

        const isSelected = state.answers[q.id] && state.answers[q.id].has(originalIdx);
        input.checked = isSelected;

        const label = document.createElement("label");
        label.className = "form-check-label";
        label.setAttribute("for", `ch_${displayIdx}`);
        label.textContent = ch.text;

        input.addEventListener("change", () => {
            if (!state.answers[q.id]) {
                state.answers[q.id] = new Set();
            }
            if (multiple) {
                if (input.checked) {
                    state.answers[q.id].add(originalIdx);
                } else {
                    state.answers[q.id].delete(originalIdx);
                }
            } else {
                state.answers[q.id] = new Set([originalIdx]);
            }
            if (state.graded[q.id] !== undefined) {
                delete state.graded[q.id];
                document.querySelectorAll(".choice").forEach(card => {
                    card.classList.remove("correct", "wrong");
                });
            }
            updateNavigationBar();
        });

        wrap.addEventListener("click", (e) => {
            if (e.target === input) return;
            input.checked = multiple ? !input.checked : true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });

        body.appendChild(input);
        body.appendChild(label);
        wrap.appendChild(body);
        choicesDiv.appendChild(wrap);
    });

    Array.from(document.querySelectorAll(".choice")).forEach(c => {
        c.classList.remove("correct", "wrong");
    });

    if (el("highlightAnswerCheckbox") && el("highlightAnswerCheckbox").checked) {
        Array.from(choicesDiv.children).forEach((wrap) => {
            const input = wrap.querySelector("input");
            if (input && q.correctIndexes.includes(parseInt(input.value))) {
                wrap.classList.add("correct");
            }
        });
    }

    if (el("highlightAnswerCheckbox")) {
        el("highlightAnswerCheckbox").onchange = () => renderCurrent();
    }

    el("btnPrev").disabled = (state.idx === 0);
    el("btnNext").textContent = (state.idx === state.order.length - 1) ? "Consegna" : "Next";

    updateNavigationBar();
    
    setTimeout(() => {
        const currentButton = el("questionNumbers").children[state.idx];
        if (currentButton) scrollNavbarToButton(currentButton);
    }, 100);

    smartMobilePosition();
}

function updateProgressBar() {
    const totalQ = state.order.length;
    let correctCount = 0;
    let wrongCount = 0;

    Object.keys(state.graded).forEach(qId => {
        if (state.graded[qId].correct) {
            correctCount++;
        } else {
            wrongCount++;
        }
    });

    el("progressBarCorrect").style.width = `${(correctCount / totalQ) * 100}%`;
    el("progressBarWrong").style.width = `${(wrongCount / totalQ) * 100}%`;
}

function smartMobilePosition() {
    if (window.innerWidth > 768) return;

    setTimeout(() => {
        const quizArea = el("quizArea");
        const navigationBar = el("navigationBar");
        const questionCard = el("questionCard");
        const stickyFooter = document.querySelector(".sticky-footer");
        
        if (!quizArea || !questionCard || !stickyFooter) return;

        const footerHeight = stickyFooter.offsetHeight;
        const navBarHeight = navigationBar ? navigationBar.offsetHeight : 0;
        const questionCardHeight = questionCard.offsetHeight;
        const totalContentHeight = navBarHeight + questionCardHeight + 60;
        const availableHeight = window.innerHeight - footerHeight;

        if (totalContentHeight <= availableHeight) {
            const targetPosition = window.innerHeight - questionCardHeight - footerHeight - 20;
            window.scrollTo({
                top: Math.max(0, questionCard.offsetTop - targetPosition),
                behavior: 'smooth'
            });
        } else {
            questionCard.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
        }
    }, 150);
}

function gradeQuestion(q) {
    const selected = Array.from(state.answers[q.id] || new Set()).sort((a, b) => a - b);
    const correct = q.correctIndexes.slice().sort((a, b) => a - b);
    const selSet = new Set(selected);
    const corrSet = new Set(correct);
    const wrongIndexes = selected.filter(i => !corrSet.has(i));
    const missingIndexes = correct.filter(i => !selSet.has(i));
    const isCorrect = wrongIndexes.length === 0 && missingIndexes.length === 0;

    if (selected.length > 0) {
        state.graded[q.id] = { correct: isCorrect, wrongIndexes, missingIndexes };
        return state.graded[q.id];
    }
    return { correct: false, wrongIndexes: [], missingIndexes: [] };
}

function showGradeOnUI(q, g) {
    const cards = document.querySelectorAll(".choice");
    cards.forEach((card) => {
        const input = card.querySelector("input");
        const originalIdx = parseInt(input.value);

        if (g.wrongIndexes.includes(originalIdx)) card.classList.add("wrong");
        if (g.missingIndexes.includes(originalIdx) || q.correctIndexes.includes(originalIdx)) {
            card.classList.add("correct");
        }
    });
}

function nextOrFinish() {
    if (state.idx < state.order.length - 1) {
        state.idx += 1;
        renderCurrent();
    } else {
        finishRun();
    }
}

async function finishRun() {
    state.mode = "finished";
    
    const currentSelection = el("setSelect").value;
    if (currentSelection.startsWith("saved_")) {
        const savedQuizId = currentSelection.replace("saved_", "");
        removeSavedQuiz(savedQuizId);
    }
    
    const total = state.order.length;
    let correctCount = 0;
    const wrongIds = [];
    const wrongQuestions = [];
    const correctQuestions = [];

    state.flatPool.forEach(q => {
        const g = state.graded[q.id] || gradeQuestion(q);
        if (g.correct) {
            correctCount += 1;
            correctQuestions.push(q);
        } else {
            const answered = state.answers[q.id] && state.answers[q.id].size > 0;
            if (answered) {
                wrongIds.push(q.id);
                wrongQuestions.push(q);
            }
        }
    });

    state.lastRunWrongIds = wrongIds;

    let removedCorrectCount = 0;
    const isReviewingErrors = el("setSelect").value === 'unified_errors';
    if (isReviewingErrors && correctQuestions.length > 0) {
        removedCorrectCount = removeCorrectAnswersFromWrongQuizzes(correctQuestions);
    }

    let addedWrongCount = 0;
    if (wrongQuestions.length > 0 && !isReviewingErrors) {
        addedWrongCount = await saveWrongQuestions(wrongQuestions);
    }

    setHidden(el("quizArea"), true);
    setHidden(el("resultArea"), false);
    el("resultSummary").innerHTML = `<strong>Punteggio:</strong> ${correctCount}/${total} corrette`;

    if (isReviewingErrors && removedCorrectCount > 0) {
        const removeMsg = document.createElement("div");
        removeMsg.className = "alert alert-success mt-2";
        removeMsg.innerHTML = `<i class="fas fa-trophy"></i> ${removedCorrectCount} ${removedCorrectCount === 1 ? 'domanda rimossa' : 'domande rimosse'} dai "Quiz Sbagliati" (risposte corrette!)`;
        el("resultSummary").appendChild(removeMsg);
    }

    if (!isReviewingErrors) {
        if (addedWrongCount > 0) {
            const saveMsg = document.createElement("div");
            saveMsg.className = "alert alert-success mt-2";
            saveMsg.innerHTML = `<i class="fas fa-save"></i> ${addedWrongCount} ${addedWrongCount === 1 ? 'nuova domanda sbagliata aggiunta' : 'nuove domande sbagliate aggiunte'} ai "Quiz Sbagliati"`;
            if (addedWrongCount < wrongQuestions.length) {
                saveMsg.innerHTML += ` (${wrongQuestions.length - addedWrongCount} erano già presenti)`;
            }
            el("resultSummary").appendChild(saveMsg);
        } else if (wrongQuestions.length > 0) {
            const saveMsg = document.createElement("div");
            saveMsg.className = "alert alert-info mt-2";
            saveMsg.innerHTML = `<i class="fas fa-info-circle"></i> Tutte le ${wrongQuestions.length} domande sbagliate erano già presenti nei "Quiz Sbagliati"`;
            el("resultSummary").appendChild(saveMsg);
        }
    }

    renderReviewList();
}

function renderReviewList() {
    const review = el("reviewList");
    review.innerHTML = "";

    const reviewOrder = state.order || state.flatPool.map(q => q.id);

    reviewOrder.forEach((questionId, index) => {
        const q = state.flatPool.find(question => question.id === questionId);
        if (!q) return;

        const g = state.graded[q.id];
        const selectedAnswers = state.answers[q.id] || new Set();
        const hasAnswered = selectedAnswers.size > 0;

        const item = document.createElement("div");
        item.className = "card";
        
        const b = document.createElement("div");
        b.className = "card-body";

        if (!hasAnswered) {
            const cardHeader = document.createElement("div");
            cardHeader.className = "card-header";
            cardHeader.style.cursor = "pointer";
            cardHeader.setAttribute("data-bs-toggle", "collapse");
            cardHeader.setAttribute("data-bs-target", `#collapse-${index}`);
            cardHeader.setAttribute("aria-expanded", "false");
            cardHeader.setAttribute("aria-controls", `collapse-${index}`);
            
            cardHeader.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span>
                        <span class="badge me-2 bg-warning text-dark">NON RISPOSTA</span> 
                        <span class="muted">${q.quizTitle} - Domanda ${index + 1}</span>
                    </span>
                    <span class="collapse-icon">▼</span>
                </div>
            `;
            item.appendChild(cardHeader);
            
            const collapseDiv = document.createElement("div");
            collapseDiv.className = "collapse";
            collapseDiv.id = `collapse-${index}`;
            
            const innerB = document.createElement("div");
            innerB.className = "card-body";
            
            const text = document.createElement("div");
            text.className = "question-text my-2";
            text.innerHTML = q.text;
            
            innerB.appendChild(text);
            collapseDiv.appendChild(innerB);
            item.appendChild(collapseDiv);
        } else {
            const title = document.createElement("div");
            title.innerHTML = `<span class="badge me-2 ${g.correct ? "bg-success" : "bg-danger"}">${g.correct ? "OK" : "ERR"}</span> <span class="muted">${q.quizTitle} - Domanda ${index + 1}</span>`;

            const text = document.createElement("div");
            text.className = "question-text my-2";
            text.innerHTML = q.text;

            b.appendChild(title);
            b.appendChild(text);
            item.appendChild(b);

            if (g.correct) {
                const sol = document.createElement("div");
                sol.className = "small text-success";
                const correctTexts = q.correctIndexes.map(i => q.choices[i].text);
                sol.innerHTML = `<em><i class="fas fa-check"></i> Risposta corretta:</em> ${correctTexts.join(" • ")}`;
                b.appendChild(sol);
            } else {
                const allChoicesDiv = document.createElement("div");
                allChoicesDiv.className = "mt-3";

                const choicesTitle = document.createElement("div");
                choicesTitle.className = "small fw-bold mb-2";
                choicesTitle.textContent = "Tutte le risposte:";
                allChoicesDiv.appendChild(choicesTitle);

                q.choices.forEach((choice, idx) => {
                    const choiceDiv = document.createElement("div");

                    const isCorrect = q.correctIndexes.includes(idx);
                    const isSelected = selectedAnswers.has(idx);

                    if (isCorrect && isSelected) {
                        choiceDiv.className = "review-choice review-correct-selected d-flex align-items-center mb-1 p-2 rounded";
                    } else if (isCorrect) {
                        choiceDiv.className = "review-choice review-correct d-flex align-items-center mb-1 p-2 rounded";
                    } else if (isSelected) {
                        choiceDiv.className = "review-choice review-wrong d-flex align-items-center mb-1 p-2 rounded";
                    } else {
                        choiceDiv.className = "review-choice review-neutral d-flex align-items-center mb-1 p-2 rounded";
                    }

                    let icon = isCorrect ? "✓ " : (isSelected ? "✗ " : "○ ");
                    choiceDiv.innerHTML = `<span class="me-2">${icon}</span><span>${choice.text}</span>`;
                    allChoicesDiv.appendChild(choiceDiv);
                });

                b.appendChild(allChoicesDiv);
            }
        }

        review.appendChild(item);
    });
}

// ==========================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================

el("setSelect").addEventListener("change", updateSetInfo);

el("btnStart").addEventListener("click", () => {
    if (!state.currentDataset) {
        showModal("Seleziona prima un dataset di quiz!");
        return;
    }
    
    const selVal = el("setSelect").value;
    if (selVal.startsWith("saved_")) {
        const savedQuizId = selVal.replace("saved_", "");
        if (!loadSavedQuiz(savedQuizId)) {
            showModal("Errore nel caricamento del quiz salvato");
        }
    } else {
        startRun(false);
    }
});

el("btnClearSaved").addEventListener("click", clearSavedQuizzes);
el("btnClearWrong").addEventListener("click", clearWrongQuizzes);

el("btnHelp").addEventListener("click", () => {
    const helpModal = new bootstrap.Modal(document.getElementById('helpModal'));
    helpModal.show();
});

el("btnSave").addEventListener("click", () => {
    if (state.mode !== "running") {
        showModal("Non c'è un quiz in corso da salvare!");
        return;
    }
    
    const savedName = saveCurrentQuiz();
    showModal(`Quiz salvato come: "${savedName}"`);
    
    state.mode = "idle";
    setHidden(el("quizArea"), true);
    setHidden(el("resultArea"), true);
});

el("btnPrev").addEventListener("click", () => {
    if (state.idx > 0) { state.idx -= 1; renderCurrent(); }
});

el("btnNext").addEventListener("click", () => {
    const q = getCurrent();
    if (state.answers[q.id] && state.answers[q.id].size > 0) {
        const g = gradeQuestion(q);
        showGradeOnUI(q, g);
    }
    if (state.idx === state.order.length - 1) {
        setTimeout(finishRun, 0);
    } else {
        setTimeout(nextOrFinish, 0);
    }
});

el("btnCheck").addEventListener("click", () => {
    const q = getCurrent();
    const g = gradeQuestion(q);
    showGradeOnUI(q, g);
    updateNavigationBar();
    updateProgressBar();
});

el("datasetSelect").addEventListener("change", (e) => {
    loadQuizzes(e.target.value);
});

el("showErrorsCheckbox").addEventListener("change", () => {
    updateNavigationBar();
});

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    if (key === "j" && state.mode === "running") {
        e.preventDefault();
        el("btnPrev").click();
    }
    if (key === "k" && state.mode === "running") {
        e.preventDefault();
        el("btnCheck").click();
    }
    if (key === "l" && state.mode === "running") {
        e.preventDefault();
        el("btnNext").click();
    }
    if (["1", "2", "3", "4"].includes(key) && state.mode === "running") {
        e.preventDefault();
        const index = parseInt(key) - 1;
        const choiceInput = document.querySelectorAll(".choice input")[index];
        if (choiceInput) choiceInput.click();
    }
});

// Inizializzazione
initializeTheme();
loadAvailableDatasets();

const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));