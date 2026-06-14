const firebaseConfig = { 
    apiKey: "AIzaSyA2FztPzHkafdH-QeCdyf2IXJj5QXSiKNo", 
    authDomain: "csmj-ab2f1.firebaseapp.com", 
    databaseURL: "https://csmj-ab2f1-default-rtdb.asia-southeast1.firebasedatabase.app", 
    projectId: "csmj-ab2f1", 
    storageBucket: "csmj-ab2f1.firebasestorage.app", 
    messagingSenderId: "510110606249", 
    appId: "1:510110606249:web:2b56fca9489f6615185ab8" 
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const VERSION = "v1.2.3-20260614"; // 修正后的完整版

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
function safeRender(html) { document.getElementById('app').innerHTML = html; }

const App = {
    data: { roomId: null, myId: null, players: {}, game: null, settings: {} },

    async init() {
        const roomId = getParam('room');
        const myId = getParam('player');
        if (!roomId) { this.renderJoin(); return; }
        this.data.roomId = roomId.toUpperCase();
        this.listenToRoom(myId);
    },

    listenToRoom(myId) {
        db.ref(`rooms/${this.data.roomId}`).on('value', snap => {
            const data = snap.val();
            if (!data) { safeRender('<div class="card">房间不存在或已解散</div>'); return; }
            this.data.players = data.players || {};
            this.data.game = data.game || this.defaultGame();
            this.data.settings = data.settings || { birdGold: 50 };
            
            if (myId && this.data.players[myId]) {
                this.data.myId = myId;
                this.autoAssignRoles();
                this.renderGame();
                this.checkAutoTransition();
            } else {
                this.renderIdentitySelect();
            }
        });
    },

    defaultGame() { 
        return { round: 0, phase: 'roleSelect', type: null, roles: {}, basic: {}, birds: {}, winnerConfirmedFinal: false, history: [] }; 
    },

    // --- 修复点击无反应的基础函数 ---
    renderJoin() {
        safeRender(`
            <div class="card">
                <div class="title">🀄 麻将计分工具</div>
                <button class="btn btn-primary" onclick="App.createRoom()">创建新房间</button>
                <div style="margin:16px 0; text-align:center; color:#7f8c8d;">或</div>
                <input type="text" id="roomInput" placeholder="输入房间号">
                <button class="btn" onclick="App.joinRoom()">加入现有房间</button>
                <div class="version-tag">${VERSION}</div>
            </div>
        `);
    },

    async createRoom() {
        const names = [];
        for (let i = 0; i < 4; i++) {
            const name = prompt(`请输入选手 ${i+1} 的姓名：`, `选手${i+1}`);
            if (!name) return;
            names.push(name.trim());
        }
        const birdGold = parseInt(prompt('抓鸟金（默认50）：', '50')) || 50;
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const players = {};
        names.forEach((name, idx) => {
            players[`p${idx}`] = { name, score: 0, role: 'player' };
        });

        await db.ref(`rooms/${roomId}`).set({
            players,
            settings: { birdGold },
            game: this.defaultGame()
        });
        window.location.href = window.location.pathname + '?room=' + roomId;
    },

    joinRoom() {
        const id = document.getElementById('roomInput').value.trim().toUpperCase();
        if (id) window.location.href = window.location.pathname + '?room=' + id;
    },

    renderIdentitySelect() {
        let html = `<div class="card"><div class="title">选择你的身份</div>`;
        Object.entries(this.data.players).forEach(([id, p]) => {
            html += `<button class="btn" onclick="App.selectIdentity('${id}')">${p.name} (${p.role === 'bird' ? '鸟民' : '选手'})</button>`;
        });
        html += `<hr><button class="btn btn-primary" onclick="App.joinAsNewBird()">加入为新鸟民</button></div>`;
        safeRender(html);
    },

    selectIdentity(id) {
        window.location.href = window.location.pathname + `?room=${this.data.roomId}&player=${id}`;
    },

    async joinAsNewBird() {
        const name = prompt('请输入您的鸟民姓名：');
        if (!name) return;
        const total = parseInt(prompt('总鸟数 (4 或 8)：', '8'));
        const birdId = 'bird_' + Date.now();
        await db.ref(`rooms/${this.data.roomId}/players/${birdId}`).set({
            name: name.trim(), score: 0, role: 'bird', birdTotal: total
        });
        this.selectIdentity(birdId);
    },

    // --- 业务逻辑 ---
    autoAssignRoles() {
        const game = this.data.game;
        if (!game || game.phase !== 'roleSelect') return;
        const roles = game.roles || {};
        const playerIds = Object.keys(this.data.players).filter(id => this.data.players[id].role === 'player');
        
        let jiepao = playerIds.find(id => roles[id] === 'jiepao');
        let fangpao = playerIds.find(id => roles[id] === 'fangpao');
        let zimo = playerIds.find(id => roles[id] === 'zimo');

        if (jiepao && fangpao) {
            playerIds.forEach(id => { if (id !== jiepao && id !== fangpao && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('none'); });
        } else if (zimo) {
            playerIds.forEach(id => { if (id !== zimo && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('tazimo'); });
        }
    },

    checkAutoTransition() {
        const game = this.data.game;
        const roomRef = db.ref(`rooms/${this.data.roomId}/game`);
        if (game.phase === 'roleSelect') {
            const roles = game.roles || {};
            const rValues = Object.values(roles);
            if (rValues.includes('jiepao') && rValues.includes('fangpao')) {
                roomRef.update({ phase: 'basicInput', type: 'jiepao', roles: { winner: Object.keys(roles).find(k=>roles[k]==='jiepao'), loser: Object.keys(roles).find(k=>roles[k]==='fangpao') } });
            } else if (rValues.includes('zimo') && rValues.filter(v=>v==='tazimo').length === 3) {
                roomRef.update({ phase: 'basicInput', type: 'zimo', roles: { winner: Object.keys(roles).find(k=>roles[k]==='zimo'), losers: Object.keys(roles).filter(k=>roles[k]==='tazimo') } });
            }
        } else if (game.phase === 'basicInput') {
            const basic = game.basic || {};
            const roles = game.roles || {};
            const done = game.type === 'jiepao' ? basic.confirmed?.[roles.loser] : roles.losers?.every(id => basic.confirmed?.[id]);
            if (done && basic.winnerConfirmed) roomRef.update({ phase: 'birdInput', birds: {} });
        } else if (game.phase === 'birdInput') {
            const birdCount = Object.values(this.data.players).filter(p => p.role === 'bird').length;
            const birds = game.birds || {};
            const birdDone = birdCount > 0 ? Object.keys(birds).length >= birdCount && Object.values(birds).every(b=>b.confirmed) : birds[game.roles.winner]?.confirmed;
            if (birdDone && game.winnerConfirmedFinal) this.finalizeRound();
        }
    },

    async finalizeRound() {
        const { game, players, settings } = this.data;
        const birdGold = settings.birdGold || 50;
        let deltas = {};
        Object.keys(players).forEach(id => deltas[id] = 0);

        // 基础分
        if (game.type === 'jiepao') {
            const val = game.basic.inputs[game.roles.loser] || 0;
            deltas[game.roles.loser] -= val; deltas[game.roles.winner] += val;
        } else {
            game.roles.losers.forEach(id => {
                const val = game.basic.inputs[id] || 0;
                deltas[id] -= val; deltas[game.roles.winner] += val;
            });
        }

        // 鸟分
        const birdPlayers = Object.keys(players).filter(id => players[id].role === 'bird');
        const activeBirds = birdPlayers.length > 0 ? game.birds : { [game.roles.winner]: game.birds[game.roles.winner] };

        Object.entries(activeBirds).forEach(([bid, b]) => {
            if (!b) return;
            const a = parseInt(b.a) || 0;
            const bVal = parseInt(b.b) || 0;
            const N = players[bid]?.birdTotal || 8;
            if (game.type === 'jiepao') {
                deltas[game.roles.loser] -= bVal * birdGold;
                deltas[game.roles.winner] += a * birdGold;
                deltas[bid] += (bVal - a) * birdGold;
            } else {
                game.roles.losers.forEach(lid => { deltas[lid] -= a * birdGold; deltas[bid] += a * birdGold; });
                const unhit = N - a;
                deltas[bid] -= unhit * birdGold; deltas[game.roles.winner] += unhit * birdGold;
            }
        });

        const updates = {};
        Object.keys(players).forEach(id => updates[`players/${id}/score`] = (players[id].score || 0) + deltas[id]);
        const history = game.history || [];
        history.push({ round: game.round + 1, type: game.type, deltas });
        updates['game'] = this.defaultGame();
        updates['game/round'] = game.round + 1;
        updates['game/history'] = history;
        await db.ref(`rooms/${this.data.roomId}`).update(updates);
    },

    // --- 实时更新 ---
    syncBirdInput(done = false) {
        const a = document.getElementById('birdA')?.value || 0;
        const b = document.getElementById('birdB')?.value || 0;
        db.ref(`rooms/${this.data.roomId}/game/birds/${this.data.myId}`).update({ a: parseInt(a), b: parseInt(b), confirmed: done });
    },

    renderGame() {
        const { players, game, myId } = this.data;
        const me = players[myId];
        let html = `<div class="card"><div class="title">房间 ${this.data.roomId} - 第 ${game.round + 1} 局</div>`;

        // 排名
        Object.entries(players).sort((a,b)=>b[1].score-a[1].score).forEach(([id, p]) => {
            html += `<div class="player-row" ${id===myId ? 'style="background:#0f3460;border-radius:8px;"' : ''}>
                <span>${p.name} ${p.role==='bird'?'🐦':'👤'}</span>
                <span class="score ${p.score>=0?'positive':'negative'}">${p.score>=0?'+':''}${p.score}</span>
            </div>`;
        });

        // 阶段 UI
        if (game.phase === 'roleSelect' && me.role === 'player') {
            html += `<div class="phase-indicator">选择角色</div>`;
            [{k:'jiepao', t:'🀄 接炮'}, {k:'fangpao', t:'💥 放炮'}, {k:'zimo', t:'⚡ 自摸'}, {k:'tazimo', t:'💸 输家'}].forEach(r => {
                html += `<button class="btn ${game.roles?.[myId]===r.k?'btn-primary':''}" onclick="App.selectRole('${r.k}')">${r.t}</button>`;
            });
        } else if (game.phase === 'basicInput') {
            if (myId === game.roles.winner) {
                html += `<div class="phase-indicator">等待确认基本分</div><button class="btn btn-primary" onclick="App.updateRef('game/basic/winnerConfirmed', true)">确认并进入抓鸟</button>`;
            } else if (game.roles.loser === myId || game.roles.losers?.includes(myId)) {
                html += `<input type="number" placeholder="输入支付分数" oninput="App.updateBasicInput(this.value)">
                         <button class="btn btn-primary" onclick="App.updateRef('game/basic/confirmed/'+App.data.myId, true)">确认支付</button>`;
            }
        } else if (game.phase === 'birdInput') {
            const hasBirdPlayers = Object.values(players).some(p => p.role === 'bird');
            if (me.role === 'bird' || (!hasBirdPlayers && myId === game.roles.winner)) {
                const b = game.birds?.[myId] || {a:0, b:0};
                html += `<div class="phase-indicator">抓鸟录入</div>
                         <input type="number" id="birdA" value="${b.a}" placeholder="中赢家数" oninput="App.syncBirdInput()">
                         ${game.type==='jiepao' ? `<input type="number" id="birdB" value="${b.b}" placeholder="中输家数" oninput="App.syncBirdInput()">` : ''}
                         <button class="btn btn-primary" onclick="App.syncBirdInput(true)">提交抓鸟</button>`;
            } else if (myId === game.roles.winner) {
                let status = '抓鸟状态：<br>';
                Object.entries(game.birds || {}).forEach(([bid, b]) => status += `${players[bid]?.name}: 胡${b.a} ${b.confirmed?'✓':'...'} `);
                html += `<div class="history-item">${status}</div><button class="btn btn-primary" onclick="App.updateRef('game/winnerConfirmedFinal', true)">最终结算</button>`;
            }
        }

        html += `<div class="version-tag">${VERSION}</div></div>`;
        if (game.history) {
            html += `<div class="card"><div class="title" style="font-size:1rem;">历史记录</div>`;
            game.history.slice().reverse().forEach(h => {
                html += `<div class="history-item">第${h.round}局: ` + 
                    Object.entries(h.deltas).map(([id, d]) => `${players[id]?.name}${d>=0?'+':''}${d}`).join(', ') + `</div>`;
            });
            html += `</div>`;
        }
        safeRender(html);
    },

    selectRole(r) { db.ref(`rooms/${this.data.roomId}/game/roles/${this.data.myId}`).set(r); },
    updateBasicInput(v) { db.ref(`rooms/${this.data.roomId}/game/basic/inputs/${this.data.myId}`).set(parseInt(v)||0); },
    updateRef(path, val) { db.ref(`rooms/${this.data.roomId}/${path}`).set(val); }
};

window.onload = () => App.init();