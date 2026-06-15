/**
 * 麻将计分工具 - 生产增强版 (v1.2.6)
 * 集成角色：系统分析师、资深程序员、界面设计师、程序测试员
 */

// --- 1. 初始化配置 ---
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
const VERSION = "v1.2.6-20260616_Final";

// --- 2. 健壮性补丁：工具类 ---
const Storage = {
    save(roomId, playerId) {
        localStorage.setItem('mj_room', roomId);
        localStorage.setItem('mj_player', playerId);
    },
    get() {
        return { 
            room: new URLSearchParams(window.location.search).get('room') || localStorage.getItem('mj_room'),
            player: new URLSearchParams(window.location.search).get('player') || localStorage.getItem('mj_player')
        };
    }
};

const Validator = {
    // 校验基本分：非负数且在合理范围内
    score(val) {
        const n = parseInt(val);
        return !isNaN(n) && n >= 0 && n < 10000;
    },
    // 校验中鸟数：不能超过总鸟数 N
    bird(val, max) {
        const n = parseInt(val);
        return !isNaN(n) && n >= 0 && n <= max;
    }
};

function safeRender(html) {
    const container = document.getElementById('app');
    if (container) container.innerHTML = html;
}

// --- 3. 核心应用逻辑 ---
const App = {
    data: { roomId: null, myId: null, players: {}, game: null, settings: {} },

    async init() {
        const { room, player } = Storage.get();
        if (!room) { this.renderJoin(); return; }

        this.data.roomId = room.toUpperCase();
        // 自动保存至本地，防止刷新丢失身份
        if (player) Storage.save(this.data.roomId, player);
        this.listenToRoom(player);
    },

    listenToRoom(myId) {
        db.ref(`rooms/${this.data.roomId}`).on('value', snap => {
            const data = snap.val();
            if (!data) { 
                safeRender('<div class="card"><p>房间已解散或不存在</p><button class="btn" onclick="location.href=location.pathname">返回首页</button></div>');
                return; 
            }
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

    // --- 界面跳转与创建 ---
    renderJoin() {
        safeRender(`
            <div class="card">
                <div class="title">🀄 麻将计分工具</div>
                <button class="btn btn-primary" onclick="App.createRoom()">创建新房间</button>
                <div style="margin:16px 0; text-align:center; color:#7f8c8d;">或加入房间</div>
                <input type="text" id="roomInput" placeholder="输入房间号">
                <button class="btn" onclick="App.joinRoom()">进入</button>
                <div class="version-tag">VERSION: ${VERSION}</div>
            </div>`);
    },

    async createRoom() {
        const names = [];
        for (let i = 0; i < 4; i++) {
            const name = prompt(`请输入选手 ${i+1} 姓名：`, `选手${i+1}`);
            if (!name) return;
            names.push(name.trim());
        }
        const birdGold = parseInt(prompt('抓鸟金（默认50）：', '50')) || 50;
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const players = {};
        names.forEach((name, idx) => { players[`p${idx}`] = { name, score: 0, role: 'player' }; });
        
        await db.ref(`rooms/${roomId}`).set({ players, settings: { birdGold }, game: this.defaultGame() });
        window.location.href = `?room=${roomId}`;
    },

    joinRoom() {
        const id = document.getElementById('roomInput').value.trim().toUpperCase();
        if (id) window.location.href = `?room=${id}`;
    },

    renderIdentitySelect() {
        let html = `<div class="card"><div class="title">确认身份</div>`;
        Object.entries(this.data.players).forEach(([id, p]) => {
            html += `<button class="btn" onclick="App.selectIdentity('${id}')">${p.name} ${p.role==='bird'?'🐦':''}</button>`;
        });
        html += `<hr><button class="btn btn-primary" onclick="App.joinAsNewBird()">加入为新鸟民</button></div>`;
        safeRender(html);
    },

    selectIdentity(id) {
        Storage.save(this.data.roomId, id);
        window.location.href = `?room=${this.data.roomId}&player=${id}`;
    },

    async joinAsNewBird() {
        const name = prompt('请输入鸟民姓名：'); if (!name) return;
        const total = parseInt(prompt('总鸟数 (4 或 8)：', '8')) || 8;
        const birdId = 'bird_' + Date.now();
        await db.ref(`rooms/${this.data.roomId}/players/${birdId}`).set({ name: name.trim(), score: 0, role: 'bird', birdTotal: total });
        this.selectIdentity(birdId);
    },

    // --- 业务逻辑：自动化流转 ---
    autoAssignRoles() {
        const game = this.data.game;
        if (!game || game.phase !== 'roleSelect') return;
        const roles = game.roles || {};
        const pIds = Object.keys(this.data.players).filter(id => this.data.players[id].role === 'player');
        
        let j = pIds.find(id => roles[id] === 'jiepao'), f = pIds.find(id => roles[id] === 'fangpao'), z = pIds.find(id => roles[id] === 'zimo');
        if (j && f) {
            pIds.forEach(id => { if (id!==j && id!==f && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('none'); });
        } else if (z) {
            pIds.forEach(id => { if (id!==z && !roles[id]) db.ref(`rooms/${this.data.roomId}/game/roles/${id}`).set('tazimo'); });
        }
    },

    checkAutoTransition() {
        const game = this.data.game;
        const roomRef = db.ref(`rooms/${this.data.roomId}/game`);
        // 角色选定后进入基本分录入
        if (game.phase === 'roleSelect') {
            const rV = Object.values(game.roles || {});
            if (rV.includes('jiepao') && rV.includes('fangpao')) {
                roomRef.update({ phase: 'basicInput', type: 'jiepao', roles: { winner: Object.keys(game.roles).find(k=>game.roles[k]==='jiepao'), loser: Object.keys(game.roles).find(k=>game.roles[k]==='fangpao') } });
            } else if (rV.includes('zimo') && rV.filter(v=>v==='tazimo').length === 3) {
                roomRef.update({ phase: 'basicInput', type: 'zimo', roles: { winner: Object.keys(game.roles).find(k=>game.roles[k]==='zimo'), losers: Object.keys(game.roles).filter(k=>game.roles[k]==='tazimo') } });
            }
        } 
        // 基本分确认后进入抓鸟
        else if (game.phase === 'basicInput') {
            const b = game.basic || {};
            const done = game.type === 'jiepao' ? b.confirmed?.[game.roles.loser] : game.roles.losers?.every(id => b.confirmed?.[id]);
            if (done && b.winnerConfirmed) roomRef.update({ phase: 'birdInput', birds: {} });
        } 
        // 抓鸟录入并经赢家复核后执行结算
        else if (game.phase === 'birdInput') {
            const birds = game.birds || {};
            const bPs = Object.values(this.data.players).filter(p => p.role === 'bird');
            // 健壮性：如果没有职业鸟民，只需赢家（代理鸟民）确认即可
            const birdDone = bPs.length > 0 
                ? (Object.keys(birds).length >= bPs.length && Object.values(birds).every(v=>v.confirmed)) 
                : birds[game.roles.winner]?.confirmed;
            
            if (birdDone && game.winnerConfirmedFinal) this.finalizeRound();
        }
    },

    // --- 财务结算引擎 (零和审计) ---
    async finalizeRound() {
        const { game, players, settings } = this.data;
        const birdGold = settings.birdGold || 50;
        let deltas = {};
        Object.keys(players).forEach(id => deltas[id] = 0);

        // 1. 基本分逻辑
        if (game.type === 'jiepao') {
            const val = game.basic.inputs[game.roles.loser] || 0;
            deltas[game.roles.loser] -= val; deltas[game.roles.winner] += val;
        } else {
            game.roles.losers.forEach(id => {
                const val = game.basic.inputs[id] || 0;
                deltas[id] -= val; deltas[game.roles.winner] += val;
            });
        }

        // 2. 抓鸟补位逻辑 (公式核心)
        const bPs = Object.keys(players).filter(id => players[id].role === 'bird');
        // 若无鸟民，赢家 ID 作为唯一的抓鸟执行者参与计算
        const activeBirds = bPs.length > 0 ? game.birds : { [game.roles.winner]: game.birds[game.roles.winner] };

        Object.entries(activeBirds).forEach(([bid, b]) => {
            if (!b) return;
            const a = parseInt(b.a) || 0, bVal = parseInt(b.b) || 0;
            const N = players[bid]?.birdTotal || 8; // 赢家补位默认 N=8
            
            if (game.type === 'jiepao') {
                // 接炮局公式: (b-a) * 金额
                deltas[game.roles.loser] -= bVal * birdGold;
                deltas[game.roles.winner] += a * birdGold;
                deltas[bid] += (bVal - a) * birdGold;
            } else {
                // 自摸局公式: (4a-N) * 金额
                game.roles.losers.forEach(lid => { deltas[lid] -= a * birdGold; deltas[bid] += a * birdGold; });
                const unhit = N - a;
                deltas[bid] -= unhit * birdGold; deltas[game.roles.winner] += unhit * birdGold;
            }
        });

        // 3. 财务审计：防止非零和平衡
        const totalSum = Object.values(deltas).reduce((acc, cur) => acc + cur, 0);
        if (Math.abs(totalSum) > 0.001) { alert("结算异常：分数不守恒，请截图联系技术支持"); return; }

        // 4. 原子覆盖更新 (修复 Ancestor Path 冲突)
        const updates = {};
        Object.keys(players).forEach(id => updates[`players/${id}/score`] = (players[id].score || 0) + deltas[id]);
        
        const nextGame = this.defaultGame();
        nextGame.round = game.round + 1;
        nextGame.history = game.history || [];
        nextGame.history.push({ round: game.round + 1, type: game.type, deltas });
        
        updates['game'] = nextGame;
        await db.ref(`rooms/${this.data.roomId}`).update(updates);
    },

    // --- 用户交互：防抖同步与校验 ---
    syncBirdInput(done = false) {
        const a = document.getElementById('birdA')?.value || 0;
        const b = document.getElementById('birdB')?.value || 0;
        const me = this.data.players[this.data.myId];
        const maxN = me.birdTotal || 8;

        if (!Validator.bird(a, maxN) || !Validator.bird(b, maxN)) {
            alert(`输入无效：数字需在 0 到 ${maxN} 之间`); return;
        }

        db.ref(`rooms/${this.data.roomId}/game/birds/${this.data.myId}`).update({ 
            a: parseInt(a), b: parseInt(b), confirmed: done 
        });
    },

    updateBasicInput(v) {
        if (!Validator.score(v)) { alert("请输入有效的金额数字"); return; }
        db.ref(`rooms/${this.data.roomId}/game/basic/inputs/${this.data.myId}`).set(parseInt(v));
    },

    // --- UI 渲染引擎 ---
    renderGame() {
        const { players, game, myId } = this.data;
        const me = players[myId];
        let html = `<div class="card"><div class="title">房间 ${this.data.roomId} - 第 ${game.round + 1} 局</div>`;

        // 排名看板
        Object.entries(players).sort((a,b)=>b[1].score - a[1].score).forEach(([id, p]) => {
            html += `<div class="player-row" ${id===myId?'style="background:rgba(233,69,96,0.15); border-radius:8px; padding:4px 8px;"':''}>
                <span>${p.name} ${p.role==='bird'?'🐦':'👤'}</span>
                <span class="score ${p.score>=0?'positive':'negative'}">${p.score>=0?'+':''}${p.score}</span>
            </div>`;
        });

        // 阶段 UI 渲染
        if (game.phase === 'roleSelect' && me.role === 'player') {
            html += `<div class="phase-indicator">请选角色</div>`;
            [{k:'jiepao', t:'🀄 接炮'}, {k:'fangpao', t:'💥 放炮'}, {k:'zimo', t:'⚡ 自摸'}, {k:'tazimo', t:'💸 输家'}].forEach(r => {
                html += `<button class="btn ${game.roles?.[myId]===r.k?'btn-primary':''}" onclick="App.selectRole('${r.k}')">${r.t}</button>`;
            });
        } 
        else if (game.phase === 'basicInput') {
            const isWinner = myId === game.roles.winner;
            if (isWinner) {
                let status = '输家录入状况：<br>';
                const ls = game.type==='jiepao'?[game.roles.loser]:game.roles.losers;
                ls.forEach(id=>status += `${players[id].name}: ${game.basic.inputs?.[id]||0} ${game.basic.confirmed?.[id]?'✓':'等待'} `);
                html += `<div class="history-item">${status}</div><button class="btn btn-primary" onclick="App.updateRef('game/basic/winnerConfirmed', true)">确认基本分并进入抓鸟</button>`;
            } else if (game.roles.loser === myId || game.roles.losers?.includes(myId)) {
                html += `<div class="phase-indicator">请输入支付分数</div>
                         <input type="number" placeholder="金额" onchange="App.updateBasicInput(this.value)">
                         <button class="btn btn-primary" onclick="App.updateRef('game/basic/confirmed/'+App.data.myId, true)">确认支付</button>`;
            } else { html += `<div class="phase-indicator">等待输家确认基本分...</div>`; }
        } 
        else if (game.phase === 'birdInput') {
            const bPs = Object.values(players).filter(p => p.role === 'bird');
            const isWinner = myId === game.roles.winner;
            // 关键：无鸟民补位 UI
            if (me.role === 'bird' || (bPs.length === 0 && isWinner)) {
                const b = game.birds?.[myId] || {a:0, b:0};
                html += `<div class="phase-indicator">抓鸟录入 (N=${me.birdTotal||8})</div>
                         <input type="number" id="birdA" value="${b.a}" placeholder="中胡家数" onchange="App.syncBirdInput()">
                         ${game.type==='jiepao' ? `<input type="number" id="birdB" value="${b.b}" placeholder="中炮家数" onchange="App.syncBirdInput()">` : ''}
                         <button class="btn btn-primary" onclick="App.syncBirdInput(true)">确认提交抓鸟</button>`;
            } else if (isWinner) {
                // 赢家复核面板
                let s = '鸟民实时数据：<br>';
                Object.entries(game.birds || {}).forEach(([bid, b]) => s += `${players[bid]?.name}: 胡${b.a} ${game.type==='jiepao'?'炮'+b.b:''} ${b.confirmed?'✓':'...'} `);
                html += `<div class="history-item">${s}</div><button class="btn btn-primary" onclick="App.updateRef('game/winnerConfirmedFinal', true)">查看完毕，确认结算本局</button>`;
            } else { html += `<div class="phase-indicator">等待抓鸟录入及赢家复核...</div>`; }
        }

        html += `<div class="version-tag">VER: ${VERSION}</div><button class="btn danger-btn" onclick="App.endGame()">结束本场牌局</button></div>`;
        safeRender(html);
    },

    // --- 快捷操作 ---
    selectRole(r) { db.ref(`rooms/${this.data.roomId}/game/roles/${this.data.myId}`).set(r); },
    updateRef(path, val) { db.ref(`rooms/${this.data.roomId}/${path}`).set(val); },
    async endGame() { if(confirm('确定结束？数据将清除')) await db.ref(`rooms/${this.data.roomId}`).remove(); }
};

window.onload = () => App.init();