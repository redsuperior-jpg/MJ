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
const VERSION = "v1.2.2-20260614"; // [4] 版本号显示

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
            if (!data) return;
            this.data.players = data.players || {};
            this.data.game = data.game || this.defaultGame();
            this.data.settings = data.settings || { birdGold: 50 };
            
            if (myId && this.data.players[myId]) {
                this.data.myId = myId;
                this.autoAssignRoles(); // 自动补全旁观/输家 [9]
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

    // 自动配对角色逻辑 [9, 10]
    autoAssignRoles() {
        const game = this.data.game;
        if (!game || game.phase !== 'roleSelect') return;
        const players = this.data.players;
        const playerIds = Object.keys(players).filter(id => players[id].role === 'player');
        const roles = game.roles || {};
        let jiepao = [], fangpao = [], zimo = [], tazimo = [];
        
        playerIds.forEach(id => {
            if (roles[id] === 'jiepao') jiepao.push(id);
            else if (roles[id] === 'fangpao') fangpao.push(id);
            else if (roles[id] === 'zimo') zimo.push(id);
            else if (roles[id] === 'tazimo') tazimo.push(id);
        });

        let updates = {};
        let changed = false;
        // 接炮局补全旁观
        if (jiepao.length === 1 && fangpao.length === 1) {
            playerIds.forEach(id => {
                if (id !== jiepao && id !== fangpao && roles[id] !== 'none') {
                    updates[id] = 'none'; changed = true;
                }
            });
        }
        // 自摸局补全输家
        if (zimo.length === 1) {
            playerIds.forEach(id => {
                if (id !== zimo && roles[id] !== 'tazimo') {
                    updates[id] = 'tazimo'; changed = true;
                }
            });
        }
        if (changed) db.ref(`rooms/${this.data.roomId}/game/roles`).update(updates);
    },

    // 阶段自动跳转逻辑 [4, 11]
    checkAutoTransition() {
        const game = this.data.game;
        if (!game) return;
        const players = this.data.players;
        const roomRef = db.ref(`rooms/${this.data.roomId}/game`);

        if (game.phase === 'roleSelect') {
            const roles = game.roles || {};
            const roleList = Object.values(roles);
            if (roleList.filter(r => r === 'jiepao').length === 1 && roleList.filter(r => r === 'fangpao').length === 1) {
                const winner = Object.keys(roles).find(k => roles[k] === 'jiepao');
                const loser = Object.keys(roles).find(k => roles[k] === 'fangpao');
                roomRef.update({ type: 'jiepao', phase: 'basicInput', roles: { winner, loser }, basic: { inputs: {}, confirmed: {}, winnerConfirmed: false } });
            } else if (roleList.filter(r => r === 'zimo').length === 1 && roleList.filter(r => r === 'tazimo').length === 3) {
                const winner = Object.keys(roles).find(k => roles[k] === 'zimo');
                const losers = Object.keys(roles).filter(k => roles[k] === 'tazimo');
                roomRef.update({ type: 'zimo', phase: 'basicInput', roles: { winner, losers }, basic: { inputs: {}, confirmed: {}, winnerConfirmed: false } });
            }
        } else if (game.phase === 'basicInput') {
            const basic = game.basic || {};
            const roles = game.roles || {};
            let allConfirmed = false;
            if (game.type === 'jiepao') allConfirmed = basic.confirmed?.[roles.loser] && basic.winnerConfirmed;
            else allConfirmed = roles.losers?.every(id => basic.confirmed?.[id]) && basic.winnerConfirmed;

            if (allConfirmed) {
                // 无论有没有职业鸟民，都进入 birdInput 阶段，让赢家有补位抓鸟的机会 [4]
                roomRef.update({ phase: 'birdInput', birds: {} });
            }
        } else if (game.phase === 'birdInput') {
            const birds = game.birds || {};
            const birdPlayers = Object.entries(players).filter(([_, p]) => p.role === 'bird');
            
            // 如果有职业鸟民，需所有人确认；如果没有，则仅看赢家是否完成操作
            const allBirdsDone = birdPlayers.length > 0 
                ? birdPlayers.every(([id]) => birds[id]?.confirmed) 
                : (birds[game.roles.winner]?.confirmed);

            if (allBirdsDone && game.winnerConfirmedFinal) {
                this.finalizeRound();
            }
        }
    },

    // 核心结算：处理赢家代理抓鸟 [4, 7, 8]
    async finalizeRound() {
        const { game, players, settings } = this.data;
        const { type, roles, basic, birds } = game;
        const birdGold = settings.birdGold || 50;
        let deltas = {};
        for (let id in players) deltas[id] = 0;

        // 基本分结算
        if (type === 'jiepao') {
            const amt = basic.inputs[roles.loser] || 0;
            deltas[roles.loser] -= amt; deltas[roles.winner] += amt;
        } else {
            roles.losers.forEach(id => {
                const amt = basic.inputs[id] || 0;
                deltas[id] -= amt; deltas[roles.winner] += amt;
            });
        }

        // 鸟民结算
        const birdPlayers = Object.entries(players).filter(([_, p]) => p.role === 'bird');
        // 如果无职业鸟，则计算赢家录入的虚拟鸟数据
        const activeBirdData = birdPlayers.length > 0 ? birds : { [roles.winner]: birds[roles.winner] };

        for (let bid in activeBirdData) {
            const b = activeBirdData[bid];
            if (!b) continue;
            const a = parseInt(b.a) || 0;
            const bVal = parseInt(b.b) || 0;
            const totalN = players[bid]?.birdTotal || 8; // 代理抓鸟默认为8鸟

            if (type === 'jiepao') {
                deltas[roles.loser] -= bVal * birdGold;
                deltas[roles.winner] += a * birdGold;
                deltas[bid] += (bVal - a) * birdGold;
            } else {
                roles.losers.forEach(lid => { deltas[lid] -= a * birdGold; deltas[bid] += a * birdGold; });
                const unhit = totalN - a;
                deltas[bid] -= unhit * birdGold; deltas[roles.winner] += unhit * birdGold;
            }
        }

        // 更新 Firebase
        const updates = {};
        for (let id in players) updates[`players/${id}/score`] = (players[id].score || 0) + deltas[id];
        const history = game.history || [];
        history.push({ round: game.round + 1, type, deltas });
        updates['game'] = this.defaultGame();
        updates['game/round'] = game.round + 1;
        updates['game/history'] = history;
        await db.ref(`rooms/${this.data.roomId}`).update(updates);
    },

    // 实时同步更新 [5]
    updateBirdInput(a, b, confirmed = false) {
        db.ref(`rooms/${this.data.roomId}/game/birds/${this.data.myId}`).update({
            a: parseInt(a) || 0,
            b: parseInt(b) || 0,
            confirmed: confirmed
        });
    },

    // 渲染 UI [6, 12-18]
    renderGame() {
        const { players, game, myId } = this.data;
        const me = players[myId];
        const birdPlayers = Object.entries(players).filter(([_, p]) => p.role === 'bird');
        
        let html = `<div class="card">
            <div class="title">第 ${game.round + 1} 局 - ${this.data.roomId}</div>`;

        // 排名列表 [12]
        const sorted = Object.entries(players).sort((a, b) => b[19].score - a[19].score);
        sorted.forEach(([id, p]) => {
            const isMe = id === myId;
            html += `<div class="player-row" ${isMe ? 'style="background:#0f3460; border-radius:8px;"' : ''}>
                <span>${p.name} ${p.role === 'bird' ? '🐦' : '👤'}</span>
                <span class="score ${p.score >= 0 ? 'positive' : 'negative'}">${p.score >= 0 ? '+' : ''}${p.score}</span>
            </div>`;
        });

        // 阶段操作区 [13-18]
        if (game.phase === 'roleSelect' && me.role === 'player') {
            html += `<div style="margin-top:15px; text-align:center;">请选择角色：</div>`;
            const rolesDef = [{k:'jiepao', t:'🀄 接炮'}, {k:'fangpao', t:'💥 放炮'}, {k:'zimo', t:'⚡ 自摸'}, {k:'tazimo', t:'💸 输家'}];
            rolesDef.forEach(r => {
                const active = game.roles?.[myId] === r.k;
                html += `<button class="btn ${active ? 'btn-primary' : ''}" onclick="App.selectRole('${r.k}')">${r.t}</button>`;
            });
        } else if (game.phase === 'basicInput') {
            const isWinner = myId === game.roles.winner;
            if (isWinner) {
                html += `<button class="btn btn-primary" onclick="App.confirmWinnerBasic()">确认基本分并进入抓鸟</button>`;
            } else if (game.roles.loser === myId || game.roles.losers?.includes(myId)) {
                html += `<input type="number" id="baseIn" placeholder="输入支付分数" oninput="App.setBasicInput(this.value)">
                         <button class="btn btn-primary" onclick="App.confirmBasic()">确认支付</button>`;
            } else {
                html += `<div class="phase-indicator">等待输家输入基本分...</div>`;
            }
        } else if (game.phase === 'birdInput') {
            // 关键：无鸟民时，赢家显示输入框 [4, 18]
            const showInput = (me.role === 'bird') || (birdPlayers.length === 0 && myId === game.roles.winner);
            if (showInput) {
                const b = game.birds?.[myId] || {a:0, b:0};
                html += `<div style="text-align:center; margin:10px 0;">抓鸟录入：</div>
                    <input type="number" id="birdA" value="${b.a}" placeholder="中胡牌方" oninput="App.syncBirdInput()">
                    ${game.type === 'jiepao' ? `<input type="number" id="birdB" value="${b.b}" placeholder="中放炮方" oninput="App.syncBirdInput()">` : ''}
                    <button class="btn btn-primary" onclick="App.syncBirdInput(true)">确认抓鸟结果</button>`;
            } else if (myId === game.roles.winner) {
                // 赢家查看实时同步的鸟数 [5, 18]
                let status = '鸟民录入：<br>';
                Object.entries(game.birds || {}).forEach(([bid, b]) => {
                    status += `${players[bid]?.name}: 胡${b.a} 炮${b.b || 0} ${b.confirmed ? '✓' : '...'}<br>`;
                });
                html += `<div class="history-item">${status}</div>
                         <button class="btn btn-primary" onclick="App.confirmFinal()">最终确认结算</button>`;
            } else {
                html += `<div class="phase-indicator">等待抓鸟录入与赢家确认...</div>`;
            }
        }

        // 版本号 [4]
        html += `<div class="version-tag">${VERSION}</div></div>`;
        safeRender(html);
    },

    // 辅助动作函数 [6, 8]
    selectRole(role) { db.ref(`rooms/${this.data.roomId}/game/roles/${this.data.myId}`).set(role); },
    setBasicInput(val) { db.ref(`rooms/${this.data.roomId}/game/basic/inputs/${this.data.myId}`).set(parseInt(val) || 0); },
    confirmBasic() { db.ref(`rooms/${this.data.roomId}/game/basic/confirmed/${this.data.myId}`).set(true); },
    confirmWinnerBasic() { db.ref(`rooms/${this.data.roomId}/game/basic/winnerConfirmed`).set(true); },
    syncBirdInput(done = false) {
        const a = document.getElementById('birdA')?.value || 0;
        const b = document.getElementById('birdB')?.value || 0;
        this.updateBirdInput(a, b, done);
    },
    confirmFinal() { db.ref(`rooms/${this.data.roomId}/game/winnerConfirmedFinal`).set(true); },
    
    renderJoin() { /* 同原代码 */ safeRender(`<div class="card"><div class="title">🀄 麻将计分工具</div><button class="btn btn-primary" onclick="App.createRoom()">创建新房间</button><div class="version-tag">${VERSION}</div></div>`); },
    createRoom() { /* 同原代码，确保初始化 players 和 settings */ }
};

window.onload = () => App.init();