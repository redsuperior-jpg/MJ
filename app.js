/**
 * 麻将计分工具 - v1.2.8 (全量修复版)
 * 修复了 Firebase 路径语法错误和返回首页无反应的问题
 */

const firebaseConfig = { 
    apiKey: "AIzaSyA2FztPzHkafdH-QeCdyf2IXJj5QXSiKNo", 
    authDomain: "csmj-ab2f1.firebaseapp.com", 
    databaseURL: "https://csmj-ab2f1-default-rtdb.asia-southeast1.firebasedatabase.app", 
    projectId: "csmj-ab2f1", 
    storageBucket: "csmj-ab2f1.firebasestorage.app", 
    messagingSenderId: "510110606249", 
    appId: "1:510110606249:web:2b56fca9489f6615185ab8" 
};

// 初始化校验
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch(e) {
    console.error("Firebase 初始化失败:", e);
}

const db = firebase.database();
const VERSION = "v1.2.8-20260616_FinalFix";

// 安全存储工具
const Storage = {
    save(roomId, playerId) {
        try {
            localStorage.setItem('mj_room', roomId || '');
            localStorage.setItem('mj_player', playerId || '');
        } catch(e) {}
    },
    get() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            return { 
                room: urlParams.get('room') || localStorage.getItem('mj_room'),
                player: urlParams.get('player') || localStorage.getItem('mj_player')
            };
        } catch(e) { return { room: null, player: null }; }
    },
    clear() {
        try {
            localStorage.removeItem('mj_room');
            localStorage.removeItem('mj_player');
        } catch(e) {}
    }
};

const safeRender = (html) => {
    const app = document.getElementById('app');
    if(app) app.innerHTML = html;
};

const App = {
    data: { roomId: null, myId: null, players: {}, game: null, settings: {} },

    async init() {
        const { room, player } = Storage.get();
        if (room) {
            this.data.roomId = room.toUpperCase();
            if (player) Storage.save(this.data.roomId, player);
            safeRender(`<div class="card"><div class="title">正在载入房间 ${this.data.roomId}...</div></div>`);
            this.listenToRoom(player);
        } else {
            this.renderJoin();
        }
    },

    listenToRoom(myId) {
        // 增加连接超时处理
        const timeout = setTimeout(() => {
            if (!this.data.game) {
                safeRender(`<div class="card"><div class="title">连接超时</div><p style="text-align:center">网络状况不佳，请刷新重试</p><button class="btn" onclick="location.reload()">手动刷新</button></div>`);
            }
        }, 5000);

        db.ref(`rooms/${this.data.roomId}`).on('value', snap => {
            clearTimeout(timeout);
            const data = snap.val();
            if (!data) { 
                // 修复：优化“返回首页”按钮的 onclick 逻辑
                safeRender(`<div class="card">
                    <p style="text-align:center; margin-bottom:20px;">房间已解散或不存在</p>
                    <button class="btn btn-primary" onclick="App.forceExit()">返回首页</button>
                </div>`);
                return; 
            }
            this.data.players = data.players || {};
            this.data.game = data.game || { round: 0, phase: 'roleSelect', history: [] };
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

    forceExit() {
        Storage.clear();
        window.location.href = window.location.pathname;
    },

    renderJoin() {
        safeRender(`
            <div class="card">
                <div class="title">🀄 麻将计分工具</div>
                <button class="btn btn-primary" onclick="App.createRoom()">创建新房间</button>
                <div style="margin:16px 0; text-align:center; color:#7f8c8d;">或加入现有房间</div>
                <input type="text" id="roomInput" placeholder="输入房间号">
                <button class="btn" onclick="App.joinRoom()">进入房间</button>
                <div class="version-tag">${VERSION}</div>
            </div>`);
    },

    async createRoom() {
        const names = [];
        for (let i = 0; i < 4; i++) {
            const n = prompt(`选手 ${i+1} 姓名：`, `选手${i+1}`);
            if (!n) return;
            names.push(n.trim());
        }
        const gold = parseInt(prompt('抓鸟金（默认50）：', '50')) || 50;
        const id = Math.random().toString(36).substring(2, 6).toUpperCase();
        const players = {};
        names.forEach((name, idx) => { players[`p${idx}`] = { name, score: 0, role: 'player' }; });
        
        try {
            await db.ref(`rooms/${id}`).set({
                players,
                settings: { birdGold: gold },
                game: { round: 0, phase: 'roleSelect', history: [] }
            });
            window.location.href = `?room=${id}`;
        } catch(e) {
            alert("房间创建失败，请检查网络");
        }
    },

    joinRoom() {
        const id = document.getElementById('roomInput').value.trim().toUpperCase();
        if (id) window.location.href = `?room=${id}`;
    },

    renderIdentitySelect() {
        let html = `<div class="card"><div class="title">确认你的身份</div>`;
        Object.entries(this.data.players).forEach(([id, p]) => {
            html += `<button class="btn" onclick="App.selectIdentity('${id}')">${p.name}</button>`;
        });
        html += `<hr><button class="btn btn-primary" onclick="App.joinAsNewBird()">加入为新鸟民</button></div>`;
        safeRender(html);
    },

    selectIdentity(id) {
        Storage.save(this.data.roomId, id);
        window.location.href = `?room=${this.data.roomId}&player=${id}`;
    },

    async joinAsNewBird() {
        const name = prompt('鸟民姓名：'); if (!name) return;
        const birdId = 'bird_' + Date.now();
        await db.ref(`rooms/${this.data.roomId}/players/${birdId}`).set({ 
            name: name.trim(), score: 0, role: 'bird', birdTotal: 8 
        });
        this.selectIdentity(birdId);
    },

    autoAssignRoles() {
        const game = this.data.game;
        if (!game || game.phase !== 'roleSelect') return;
        const roles = game.roles || {};
        const pIds = Object.keys(this.data.players).filter(id => this.data.players[id].role === 'player');
        let j = pIds.find(id => roles[id] === 'jiepao'), f = pIds.find(id => roles[id] === 'fangpao'), z = pIds.find(id => roles[id] === 'zimo');
        if (j && f) pIds.forEach(id => { if (id!==j && id!==f && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('none'); });
        else if (z) pIds.forEach(id => { if (id!==z && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('tazimo'); });
    },

    checkAutoTransition() {
        const game = this.data.game;
        const roomRef = db.ref(`rooms/${this.data.roomId}/game`);
        if (game.phase === 'roleSelect') {
            const rV = Object.values(game.roles || {});
            if (rV.includes('jiepao') && rV.includes('fangpao')) {
                roomRef.update({ phase: 'basicInput', type: 'jiepao', roles: { winner: Object.keys(game.roles).find(k=>game.roles[k]==='jiepao'), loser: Object.keys(game.roles).find(k=>game.roles[k]==='fangpao') } });
            } else if (rV.includes('zimo') && rV.filter(v=>v==='tazimo').length === 3) {
                roomRef.update({ phase: 'basicInput', type: 'zimo', roles: { winner: Object.keys(game.roles).find(k=>game.roles[k]==='zimo'), losers: Object.keys(game.roles).filter(k=>game.roles[k]==='tazimo') } });
            }
        } else if (game.phase === 'basicInput') {
            const b = game.basic || {};
            const done = game.type === 'jiepao' ? b.confirmed?.[game.roles.loser] : game.roles.losers?.every(id => b.confirmed?.[id]);
            if (done && b.winnerConfirmed) roomRef.update({ phase: 'birdInput', birds: {} });
        } else if (game.phase === 'birdInput') {
            const bPs = Object.values(this.data.players).filter(p => p.role === 'bird');
            const birdDone = bPs.length > 0 ? (Object.values(game.birds || {}).every(v=>v.confirmed) && Object.keys(game.birds || {}).length >= bPs.length) : (game.birds?.[game.roles.winner]?.confirmed);
            if (birdDone && game.winnerConfirmedFinal) this.finalizeRound();
        }
    },

    async finalizeRound() {
        const { game, players, settings } = this.data;
        const birdGold = settings.birdGold || 50;
        let deltas = {};
        Object.keys(players).forEach(id => deltas[id] = 0);

        if (game.type === 'jiepao') {
            const val = game.basic.inputs[game.roles.loser] || 0;
            deltas[game.roles.loser] -= val; deltas[game.roles.winner] += val;
        } else {
            game.roles.losers.forEach(id => {
                const val = game.basic.inputs[id] || 0;
                deltas[id] -= val; deltas[game.roles.winner] += val;
            });
        }

        const bPs = Object.keys(players).filter(id => players[id].role === 'bird');
        const activeBirds = bPs.length > 0 ? (game.birds || {}) : { [game.roles.winner]: (game.birds?.[game.roles.winner] || {a:0, b:0}) };

        Object.entries(activeBirds).forEach(([bid, b]) => {
            const a = parseInt(b.a) || 0, bVal = parseInt(b.b) || 0;
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
        // 原子化重置下一局
        updates['game'] = { round: game.round + 1, phase: 'roleSelect', roles: {}, basic: {}, birds: {}, winnerConfirmedFinal: false, history: history };
        await db.ref(`rooms/${this.data.roomId}`).update(updates);
    },

    renderGame() {
        const { players, game, myId } = this.data;
        const me = players[myId];
        let html = `<div class="card"><div class="title">第 ${game.round + 1} 局 - 房间 ${this.data.roomId}</div>`;

        Object.entries(players).sort((a,b)=>b[1].score - a[1].score).forEach(([id, p]) => {
            html += `<div class="player-row" ${id===myId?'style="background:rgba(233,69,96,0.15); border-radius:8px; padding:4px 8px;"':''}>
                <span>${p.name} ${p.role==='bird'?'🐦':'👤'}</span>
                <span class="score ${p.score>=0?'positive':'negative'}">${p.score>=0?'+':''}${p.score}</span>
            </div>`;
        });

        if (game.phase === 'roleSelect' && me.role === 'player') {
            html += `<div class="phase-indicator">请选角色</div>`;
            [{k:'jiepao', t:'🀄 接炮'}, {k:'fangpao', t:'💥 放炮'}, {k:'zimo', t:'⚡ 自摸'}, {k:'tazimo', t:'💸 输家'}].forEach(r => {
                html += `<button class="btn ${game.roles?.[myId]===r.k?'btn-primary':''}" onclick="App.selectRole('${r.k}')">${r.t}</button>`;
            });
        } else if (game.phase === 'basicInput') {
            const isWinner = myId === game.roles.winner;
            if (isWinner) {
                let s = '等待确认：<br>';
                const ls = game.type==='jiepao'?[game.roles.loser]:game.roles.losers;
                ls.forEach(id=>s += `${players[id].name}: ${game.basic.inputs?.[id]||0} ${game.basic.confirmed?.[id]?'✓':'...'} `);
                html += `<div class="history-item">${s}</div><button class="btn btn-primary" onclick="App.updateRef('game/basic/winnerConfirmed', true)">复核基本分</button>`;
            } else if (game.roles.loser === myId || game.roles.losers?.includes(myId)) {
                html += `<input type="number" placeholder="金额" onchange="App.updateBasicInput(this.value)">
                         <button class="btn btn-primary" onclick="App.updateRef('game/basic/confirmed/'+App.data.myId, true)">确认支付</button>`;
            } else { html += `<div class="phase-indicator">等待其他选手操作...</div>`; }
        } else if (game.phase === 'birdInput') {
            const bPs = Object.values(players).filter(p => p.role === 'bird');
            if (me.role === 'bird' || (bPs.length === 0 && myId === game.roles.winner)) {
                const b = game.birds?.[myId] || {a:0, b:0};
                html += `<div class="phase-indicator">抓鸟录入 (N=${me.birdTotal||8})</div>
                    <input type="number" id="birdA" value="${b.a}" placeholder="中胡家数" onchange="App.syncBirdInput()">
                    ${game.type==='jiepao' ? `<input type="number" id="birdB" value="${b.b}" placeholder="中炮家数" onchange="App.syncBirdInput()">` : ''}
                    <button class="btn btn-primary" onclick="App.syncBirdInput(true)">提交抓鸟结果</button>`;
            } else if (myId === game.roles.winner) {
                let s = '抓鸟状态：<br>';
                Object.entries(game.birds || {}).forEach(([bid, b]) => s += `${players[bid]?.name}: 胡${b.a} ${b.confirmed?'✓':'...'} `);
                html += `<div class="history-item">${s}</div><button class="btn btn-primary" onclick="App.updateRef('game/winnerConfirmedFinal', true)">确认结算</button>`;
            }
        }

        html += `<div class="version-tag">${VERSION}</div><button class="btn danger-btn" onclick="App.endGame()">解散本场牌局</button></div>`;
        safeRender(html);
    },

    selectRole(r) { db.ref(`rooms/${this.data.roomId}/game/roles/${this.data.myId}`).set(r); },
    updateBasicInput(v) { db.ref(`rooms/${this.data.roomId}/game/basic/inputs/${this.data.myId}`).set(parseInt(v)||0); },
    syncBirdInput(done = false) {
        const a = parseInt(document.getElementById('birdA')?.value) || 0;
        const b = parseInt(document.getElementById('birdB')?.value) || 0;
        db.ref(`rooms/${this.data.roomId}/game/birds/${this.data.myId}`).update({ a, b, confirmed: done });
    },
    updateRef(path, val) { db.ref(`rooms/${this.data.roomId}/${path}`).set(val); },
    async endGame() { 
        if(confirm('确定解散牌局？此操作不可恢复')) {
            await db.ref(`rooms/${this.data.roomId}`).remove();
            this.forceExit();
        } 
    }
};

window.onload = () => App.init();