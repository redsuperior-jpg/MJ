const firebaseConfig = {
  apiKey: "AIzaSyA2FztPzHkafdH-QeCdyf2IXJj5QXSiKNo",
  authDomain: "csmj-ab2f1.firebaseapp.com",
  databaseURL: "https://csmj-ab2f1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "csmj-ab2f1",
  storageBucket: "csmj-ab2f1.firebasestorage.app",
  messagingSenderId: "510110606249",
  appId: "1:510110606249:web:2b56fca9489f6615185ab8",
  measurementId: "G-CLMQG999PE"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }

function safeRender(html) {
  try {
    document.getElementById('app').innerHTML = html;
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="card"><p>渲染出错：${e.message}</p></div>`;
    console.error(e);
  }
}

const App = {
  data: {
    roomId: null,
    myId: null,
    players: {},
    game: null,
    settings: {}
  },

  async init() {
    const roomId = getParam('room');
    const myId = getParam('player');

    if (!roomId) {
      this.renderJoin();
      return;
    }

    this.data.roomId = roomId.toUpperCase();
    try {
      const snap = await db.ref(`rooms/${this.data.roomId}`).once('value');
      if (!snap.exists()) {
        alert('房间不存在');
        window.location.href = window.location.pathname;
        return;
      }
      const roomData = snap.val();
      this.data.players = roomData.players || {};
      this.data.game = roomData.game || this.defaultGame();
      this.data.settings = roomData.settings || { birdGold: 50 };

      if (myId && this.data.players[myId]) {
        this.data.myId = myId;
        this.listenToRoom();
        this.renderGame();
      } else if (myId) {
        alert('身份无效，请重新选择');
        window.location.href = window.location.pathname + '?room=' + this.data.roomId;
      } else {
        this.renderIdentitySelect();
      }
    } catch (e) {
      console.error('初始化失败', e);
      safeRender(`<div class="card"><p>加载失败：${e.message}</p></div>`);
    }
  },

  defaultGame() {
    return {
      round: 0,
      phase: 'roleSelect',
      type: null,
      roles: {},
      basic: {},
      birds: {},
      winnerConfirmedFinal: false,
      history: []
    };
  },

  renderJoin() {
    safeRender(`
      <div class="card">
        <div class="title">🀄 麻将计分工具</div>
        <button class="btn btn-primary" onclick="App.createRoom()">创建新房间</button>
        <div style="margin:16px 0; text-align:center; color:#7f8c8d;">或</div>
        <input type="text" id="roomInput" placeholder="输入房间号">
        <button class="btn" onclick="App.joinRoom()">加入房间</button>
      </div>
    `);
  },

  async createRoom() {
    const names = [];
    for (let i = 0; i < 4; i++) {
      const name = prompt(`选手${i+1} 的姓名：`, `选手${i+1}`);
      if (!name) return;
      names.push(name.trim());
    }
    const addBird = confirm('是否现在添加鸟民？');
    const birdPlayers = [];
    if (addBird) {
      const count = parseInt(prompt('鸟民数量 (1-3)：', '1'));
      if (isNaN(count) || count < 1 || count > 3) return alert('数量无效');
      for (let i = 0; i < count; i++) {
        const name = prompt(`鸟民${i+1} 的姓名：`, `鸟民${i+1}`);
        if (!name) return;
        const total = parseInt(prompt(`${name} 的总鸟数 (4 或 8)：`, '8'));
        if (![4, 8].includes(total)) return alert('总鸟数只能为4或8');
        birdPlayers.push({ name: name.trim(), birdTotal: total });
      }
    }
    const birdGold = parseInt(prompt('抓鸟金（默认50）：', '50')) || 50;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const players = {};
    names.forEach((name, idx) => { players[idx] = { name, score: 0, role: 'player' }; });
    birdPlayers.forEach((bp, idx) => { players['bird_' + idx] = { name: bp.name, score: 0, role: 'bird', birdTotal: bp.birdTotal }; });

    await db.ref(`rooms/${roomId}`).set({
      players,
      settings: { birdGold },
      game: this.defaultGame()
    });
    window.location.href = window.location.pathname + '?room=' + roomId;
  },

  async joinRoom() {
    const roomId = document.getElementById('roomInput').value.trim().toUpperCase();
    if (!roomId) return alert('请输入房间号');
    const snap = await db.ref(`rooms/${roomId}`).once('value');
    if (!snap.exists()) { alert('房间不存在'); return; }
    window.location.href = window.location.pathname + '?room=' + roomId;
  },

  renderIdentitySelect() {
    const players = this.data.players;
    if (!players || Object.keys(players).length === 0) {
      safeRender(`<div class="card"><p>玩家数据加载中...</p></div>`);
      return;
    }
    let playerBtns = '', birdBtns = '';
    for (let id in players) {
      const p = players[id];
      const btn = `<button class="btn btn-small" onclick="App.selectIdentity('${id}')">${p.name} (${p.role==='bird'?'鸟民':'选手'})</button>`;
      if (p.role === 'player') playerBtns += btn;
      else birdBtns += btn;
    }
    const birdCount = Object.values(players).filter(p => p.role === 'bird').length;
    let joinBirdBtn = birdCount < 3 ? `<button class="btn" onclick="App.joinAsNewBird()">加入为新鸟民</button>` : '';
    safeRender(`
      <div class="card">
        <div class="title">选择你的身份</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">${playerBtns}${birdBtns}</div>
        ${joinBirdBtn}
      </div>
    `);
  },

  selectIdentity(playerId) {
    window.location.href = window.location.pathname + '?room=' + this.data.roomId + '&player=' + playerId;
  },

  async joinAsNewBird() {
    const name = prompt('你的鸟民名字：');
    if (!name) return;
    const total = parseInt(prompt('你的总鸟数 (4 或 8)：', '8'));
    if (![4, 8].includes(total)) return alert('总鸟数只能为4或8');
    const birdId = 'bird_' + Date.now();
    await db.ref(`rooms/${this.data.roomId}/players/${birdId}`).set({
      name: name.trim(), score: 0, role: 'bird', birdTotal: total
    });
    window.location.href = window.location.pathname + '?room=' + this.data.roomId + '&player=' + birdId;
  },

  listenToRoom() {
    db.ref(`rooms/${this.data.roomId}`).on('value', snap => {
      const data = snap.val();
      if (!data) {
        alert('房间已结束');
        window.location.href = window.location.pathname;
        return;
      }
      this.data.players = data.players || {};
      this.data.game = data.game || this.defaultGame();
      this.data.settings = data.settings || { birdGold: 50 };
      this.autoAssignRoles();
      this.renderGame();
      this.checkAutoTransition();
    });
  },

  autoAssignRoles() {
    const game = this.data.game;
    if (!game || game.phase !== 'roleSelect') return;
    const players = this.data.players;
    const playerIds = Object.keys(players).filter(id => players[id].role === 'player');
    const roles = game.roles || {};

    let jiepao = [], fangpao = [], zimo = [], tazimo = [];
    playerIds.forEach(id => {
      const r = roles[id];
      if (r === 'jiepao') jiepao.push(id);
      else if (r === 'fangpao') fangpao.push(id);
      else if (r === 'zimo') zimo.push(id);
      else if (r === 'tazimo') tazimo.push(id);
    });

    if ((jiepao.length > 0 || fangpao.length > 0) && (zimo.length > 0 || tazimo.length > 0)) {
      const reset = {};
      playerIds.forEach(id => reset[id] = null);
      db.ref(`rooms/${this.data.roomId}/game/roles`).set(reset);
      return;
    }

    let newRoles = { ...roles };
    if (jiepao.length === 1 && fangpao.length === 1) {
      playerIds.forEach(id => {
        if (id !== jiepao[0] && id !== fangpao[0]) newRoles[id] = 'none';
      });
    }
    if (zimo.length === 1) {
      playerIds.forEach(id => {
        if (id !== zimo[0]) newRoles[id] = 'tazimo';
      });
    }

    let changed = false;
    for (let id of playerIds) {
      if (newRoles[id] !== roles[id]) { changed = true; break; }
    }
    if (changed) {
      const updates = {};
      playerIds.forEach(id => updates[id] = newRoles[id] || null);
      db.ref(`rooms/${this.data.roomId}/game/roles`).update(updates);
    }
  },

  checkAutoTransition() {
    const game = this.data.game;
    if (!game) return;
    const players = this.data.players;
    const roomRef = db.ref(`rooms/${this.data.roomId}/game`);

    if (game.phase === 'roleSelect') {
      const playerIds = Object.keys(players).filter(id => players[id].role === 'player');
      const roles = game.roles || {};
      const selected = {};
      playerIds.forEach(id => selected[id] = roles[id]);

      const jiepao = Object.entries(selected).filter(([id,r]) => r === 'jiepao');
      const fangpao = Object.entries(selected).filter(([id,r]) => r === 'fangpao');
      const zimo = Object.entries(selected).filter(([id,r]) => r === 'zimo');
      const tazimo = Object.entries(selected).filter(([id,r]) => r === 'tazimo');

      let type = null, basicRoles = {};
      if (jiepao.length === 1 && fangpao.length === 1 &&
          zimo.length === 0 && tazimo.length === 0 &&
          playerIds.every(id => selected[id] === 'jiepao' || selected[id] === 'fangpao' || selected[id] === 'none')) {
        type = 'jiepao';
        basicRoles = { winner: jiepao[0][0], loser: fangpao[0][0] };
      } else if (zimo.length === 1 && tazimo.length === 3 &&
                 jiepao.length === 0 && fangpao.length === 0) {
        type = 'zimo';
        basicRoles = { winner: zimo[0][0], losers: tazimo.map(p => p[0]) };
      }

      if (type) {
        roomRef.update({
          type,
          phase: 'basicInput',
          roles: basicRoles,
          basic: { inputs: {}, confirmed: {}, winnerConfirmed: false },
          birds: {},
          winnerConfirmedFinal: false
        });
      }
    }

    if (game.phase === 'basicInput' && game.basic && game.roles) {
      const basic = game.basic;
      const roles = game.roles;
      let allLosersConfirmed = false;
      if (game.type === 'jiepao') {
        allLosersConfirmed = basic.confirmed[roles.loser] === true;
      } else if (game.type === 'zimo') {
        allLosersConfirmed = roles.losers.every(id => basic.confirmed[id] === true);
      }
      if (allLosersConfirmed && basic.winnerConfirmed) {
        const birdPlayers = Object.entries(players).filter(([id, p]) => p.role === 'bird');
        if (birdPlayers.length > 0) {
          roomRef.update({ phase: 'birdInput', birds: {} });
        } else {
          this.finalizeRound();
        }
      }
    }

    if (game.phase === 'birdInput') {
      const birdPlayers = Object.entries(players).filter(([id, p]) => p.role === 'bird');
      const allBirdsConfirmed = birdPlayers.every(([id]) => game.birds[id]?.confirmed === true);
      if (allBirdsConfirmed && game.winnerConfirmedFinal) {
        this.finalizeRound();
      }
    }
  },

  async finalizeRound() {
    const game = this.data.game;
    const players = this.data.players;
    const settings = this.data.settings;
    const type = game.type;
    const roles = game.roles;
    const birdGold = settings.birdGold || 50;
    const basic = game.basic || {};
    const deltas = {};
    for (let id in players) deltas[id] = 0;

    // 基本分
    if (type === 'jiepao') {
      const amount = basic.inputs[roles.loser] || 0;
      deltas[roles.loser] -= amount;
      deltas[roles.winner] += amount;
    } else if (type === 'zimo') {
      roles.losers.forEach(id => {
        const amount = basic.inputs[id] || 0;
        deltas[id] -= amount;
        deltas[roles.winner] += amount;
      });
    }

    // 鸟民影响（直接从当前 game.birds 读取，确保最新）
    const birds = game.birds || {};
    for (let id in players) {
      if (players[id].role === 'bird' && birds[id]) {
        const bird = players[id];
        const N = bird.birdTotal;
        const a = parseInt(birds[id].a) || 0;
        const b = parseInt(birds[id].b) || 0;

        if (type === 'jiepao') {
          // 放炮方给鸟民 b * 金
          deltas[roles.loser] -= b * birdGold;
          deltas[id] += b * birdGold;
          // 鸟民给胡牌方 a * 金
          deltas[id] -= a * birdGold;
          deltas[roles.winner] += a * birdGold;
        } else if (type === 'zimo') {
          // 每个输家给鸟民 a * 金
          roles.losers.forEach(lid => {
            deltas[lid] -= a * birdGold;
            deltas[id] += a * birdGold;
          });
          // 鸟民给胡牌方 (N - a) * 金
          const unhit = N - a;
          deltas[id] -= unhit * birdGold;
          deltas[roles.winner] += unhit * birdGold;
        }
      }
    }

    // 更新分数
    const updates = {};
    for (let id in players) {
      updates[`players/${id}/score`] = (players[id].score || 0) + (deltas[id] || 0);
    }
    const history = game.history || [];
    history.push({
      round: game.round + 1,
      type,
      basics: basic.inputs,
      birds: game.birds,
      deltas
    });
    updates['game/history'] = history;
    updates['game/round'] = game.round + 1;
    updates['game/phase'] = 'roleSelect';
    updates['game/type'] = null;
    updates['game/roles'] = {};
    updates['game/basic'] = {};
    updates['game/birds'] = {};
    updates['game/winnerConfirmedFinal'] = false;

    await db.ref(`rooms/${this.data.roomId}`).update(updates);
  },

  async endGame() {
    if (!confirm('确定要结束本场牌局吗？所有数据将被清除！')) return;
    await db.ref(`rooms/${this.data.roomId}`).remove();
  },

  selectRole(role) {
    if (this.data.game.phase !== 'roleSelect') return;
    db.ref(`rooms/${this.data.roomId}/game/roles/${this.data.myId}`).set(role);
  },

  setMyBasicInput(value) {
    const myId = this.data.myId;
    const game = this.data.game;
    if (game.phase !== 'basicInput') return;
    let isLoser = false;
    if (game.type === 'jiepao' && game.roles.loser === myId) isLoser = true;
    if (game.type === 'zimo' && game.roles.losers.includes(myId)) isLoser = true;
    if (!isLoser) return;
    const num = parseInt(value) || 0;
    if (num <= 0) return;
    db.ref(`rooms/${this.data.roomId}/game/basic/inputs/${myId}`).set(num);
  },

  confirmLoserInput() {
    db.ref(`rooms/${this.data.roomId}/game/basic/confirmed/${this.data.myId}`).set(true);
  },

  confirmWinnerBasic() {
    db.ref(`rooms/${this.data.roomId}/game/basic/winnerConfirmed`).set(true);
  },

  // 修改后的鸟民输入：只更新数值，保留 confirmed 状态
  updateBirdInput(a, b) {
    const myId = this.data.myId;
    const game = this.data.game;
    if (game.phase !== 'birdInput' || this.data.players[myId].role !== 'bird') return;
    // 读取现有数据，避免覆盖 confirmed
    const current = game.birds[myId] || { a: 0, b: 0, confirmed: false };
    current.a = parseInt(a) || 0;
    if (game.type === 'jiepao') current.b = parseInt(b) || 0;
    db.ref(`rooms/${this.data.roomId}/game/birds/${myId}`).set(current);
  },

  confirmBirdInput() {
    const myId = this.data.myId;
    const game = this.data.game;
    if (game.phase !== 'birdInput' || this.data.players[myId].role !== 'bird') return;
    // 仅更新 confirmed 字段，保留已有的 a, b
    const current = game.birds[myId] || { a: 0, b: 0 };
    current.confirmed = true;
    db.ref(`rooms/${this.data.roomId}/game/birds/${myId}`).set(current);
  },

  confirmWinnerFinal() {
    db.ref(`rooms/${this.data.roomId}/game/winnerConfirmedFinal`).set(true);
  },

  renderGame() {
    const players = this.data.players;
    const game = this.data.game;
    const myId = this.data.myId;
    if (!players || !game || !myId) {
      safeRender(`<div class="card"><p>加载中...</p></div>`);
      return;
    }
    const me = players[myId];
    if (!me) {
      safeRender(`<div class="card"><p>身份信息丢失，请重新加入</p></div>`);
      return;
    }

    try {
      const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
      let rankingHtml = '';
      sorted.forEach(([id, p], index) => {
        const isMe = (id === myId);
        rankingHtml += `
          <div class="player-row" style="${isMe ? 'background:#0f3460; border-radius:10px; padding:8px;' : ''}">
            <span>${index+1}. ${p.name} ${isMe ? '(我)' : ''} [${p.role==='bird'?'鸟':'选'}]</span>
            <span class="score ${p.score >= 0 ? 'positive' : 'negative'}">${p.score >= 0 ? '+' + p.score : p.score}</span>
          </div>
        `;
      });

      let phaseText = '';
      if (game.phase === 'roleSelect') phaseText = '选择本局角色';
      else if (game.phase === 'basicInput') phaseText = `基本分数 (${game.type==='jiepao'?'接炮':'自摸'})`;
      else if (game.phase === 'birdInput') phaseText = '鸟民抓鸟';
      else if (game.phase === 'result') phaseText = '结算中';

      let mainHtml = `
        <div class="card">
          <div style="display:flex; justify-content:space-between;">
            <strong>第 ${game.round + 1} 局</strong>
            <span style="color:#a0a0b0;">房间 ${this.data.roomId}</span>
          </div>
          <div class="phase-indicator">${phaseText}</div>
          ${rankingHtml}
          <hr>
      `;

      // 角色选择阶段
      if (game.phase === 'roleSelect' && me.role === 'player') {
        const myRole = game.roles?.[myId];
        if (myRole === 'none') {
          mainHtml += `<p style="text-align:center;">本局你为旁观，无基本分数变动</p>`;
        } else {
          mainHtml += `<p style="text-align:center;">请选择你本局的角色：</p>`;
          const allRoles = [
            { key: 'jiepao', text: '接炮 (别人点炮我胡)' },
            { key: 'fangpao', text: '放炮 (我点炮别人胡)' },
            { key: 'zimo', text: '自摸 (我自己摸胡)' },
            { key: 'tazimo', text: '他人自摸 (别人自摸我输)' }
          ];
          allRoles.forEach(r => {
            const selected = myRole === r.key;
            mainHtml += `<button class="btn ${selected ? 'btn-primary' : ''}" onclick="App.selectRole('${r.key}')">${r.text}</button>`;
          });
          if (myRole) {
            const roleText = allRoles.find(r=>r.key===myRole)?.text || myRole;
            mainHtml += `<p style="color:#2ecc71; text-align:center;">已选择：${roleText} (可点击其他按钮修改)</p>`;
          }
        }
      } else if (game.phase === 'roleSelect' && me.role === 'bird') {
        mainHtml += `<p style="text-align:center;">鸟民等待基本分数阶段...</p>`;
      }

      // 基本分数输入阶段
      else if (game.phase === 'basicInput' && game.roles) {
        const roles = game.roles;
        const basicData = game.basic || {};
        let isLoser = false, isWinner = false;
        if (game.type === 'jiepao') {
          isLoser = (myId === roles.loser);
          isWinner = (myId === roles.winner);
        } else if (game.type === 'zimo') {
          isLoser = roles.losers.includes(myId);
          isWinner = (myId === roles.winner);
        }

        if (isLoser) {
          const myInput = basicData.inputs?.[myId] || '';
          const confirmed = basicData.confirmed?.[myId] || false;
          mainHtml += `
            <div>
              <p><strong>你需支付给 ${players[roles.winner].name} 的分数</strong></p>
              <input type="number" value="${myInput}" placeholder="输入分数" onchange="App.setMyBasicInput(this.value)" ${confirmed ? 'disabled' : ''}>
              <button class="btn btn-primary" onclick="App.confirmLoserInput()" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认支付'}</button>
            </div>
          `;
        }
        if (isWinner) {
          let loserInfo = '';
          const losers = game.type === 'jiepao' ? [roles.loser] : roles.losers;
          losers.forEach(id => {
            const val = basicData.inputs?.[id];
            const conf = basicData.confirmed?.[id] || false;
            loserInfo += `<div>${players[id].name}: ${val !== undefined ? val : '未输入'} ${conf ? '✓' : '等待'}</div>`;
          });
          mainHtml += `
            <div>
              <p><strong>输家输入情况 (你为赢家)</strong></p>
              ${loserInfo}
              <button class="btn btn-primary" onclick="App.confirmWinnerBasic()" ${basicData.winnerConfirmed ? 'disabled' : ''}>${basicData.winnerConfirmed ? '已确认' : '确认基本分数'}</button>
            </div>
          `;
        }
        const loserCount = game.type === 'jiepao' ? 1 : roles.losers.length;
        const confirmedLosers = game.type === 'jiepao' ? (basicData.confirmed?.[roles.loser] ? 1 : 0) : roles.losers.filter(id => basicData.confirmed?.[id]).length;
        mainHtml += `<div class="progress"><div class="progress-fill" style="width:${(confirmedLosers/loserCount)*100}%"></div></div>`;
        mainHtml += `<p style="text-align:center;">输家确认: ${confirmedLosers}/${loserCount} | 赢家: ${basicData.winnerConfirmed ? '已确认' : '待确认'}</p>`;
      }

      // 鸟民输入阶段（修复显示和交互）
      else if (game.phase === 'birdInput') {
        const roles = game.roles;
        const isBird = me.role === 'bird';
        const isWinner = (myId === roles.winner);
        const birdPlayers = Object.entries(players).filter(([id, p]) => p.role === 'bird');
        const birdData = game.birds || {};

        if (isBird) {
          const myBird = birdData[myId] || { a: '', b: '' };
          const confirmed = myBird.confirmed || false;
          mainHtml += `
            <div>
              <p><strong>你的抓鸟 (总鸟数: ${me.birdTotal})</strong></p>
              <label>中胡牌方个数: <input type="number" id="birdA" value="${myBird.a || ''}" onchange="App.syncBirdInput()" ${confirmed ? 'disabled' : ''}></label>
              ${game.type === 'jiepao' ? `<label>中放炮方个数: <input type="number" id="birdB" value="${myBird.b || ''}" onchange="App.syncBirdInput()" ${confirmed ? 'disabled' : ''}></label>` : ''}
              <button class="btn btn-primary" onclick="App.confirmBirdInput()" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认抓鸟'}</button>
            </div>
          `;
        }
        if (isWinner) {
          let birdStatus = '';
          birdPlayers.forEach(([id, p]) => {
            const b = birdData[id] || {};
            const a = b.a !== undefined ? b.a : '?';
            const bVal = b.b !== undefined ? b.b : '?';
            birdStatus += `<div>${p.name}: 中胡${a} ${game.type==='jiepao' ? '中炮'+bVal : ''} ${b.confirmed ? '✓' : '未确认'}</div>`;
          });
          mainHtml += `
            <div>
              <p><strong>鸟民输入 (你为赢家)</strong></p>
              ${birdStatus}
              <button class="btn btn-primary" onclick="App.confirmWinnerFinal()" ${game.winnerConfirmedFinal ? 'disabled' : ''}>${game.winnerConfirmedFinal ? '已确认' : '最终确认本局'}</button>
            </div>
          `;
        }
        const confirmedBirds = birdPlayers.filter(([id]) => birdData[id]?.confirmed).length;
        mainHtml += `<div class="progress"><div class="progress-fill" style="width:${birdPlayers.length ? (confirmedBirds/birdPlayers.length)*100 : 0}%"></div></div>`;
        mainHtml += `<p style="text-align:center;">鸟民确认: ${confirmedBirds}/${birdPlayers.length} | 赢家最终: ${game.winnerConfirmedFinal ? '已确认' : '待确认'}</p>`;
      }

      // 历史记录
      if (game.history?.length) {
        mainHtml += `<hr><p><strong>历史记录</strong></p>`;
        game.history.slice().reverse().forEach(h => {
          const typeName = h.type === 'jiepao' ? '接炮' : '自摸';
          mainHtml += `<div class="history-item"><strong>第 ${h.round} 局 (${typeName})</strong><div class="delta-list">`;
          for (let pid in h.deltas) {
            const d = h.deltas[pid];
            const cls = d >= 0 ? 'positive' : 'negative';
            mainHtml += `<span class="delta-badge ${cls}">${players[pid]?.name}: ${d>0?'+'+d:d}</span>`;
          }
          mainHtml += `</div></div>`;
        });
      }

      mainHtml += `
        <hr>
        <button class="btn danger-btn" onclick="App.endGame()">结束本场牌局</button>
      </div>`;

      safeRender(mainHtml);

      window.syncBirdInput = () => {
        const a = document.getElementById('birdA')?.value;
        const b = document.getElementById('birdB')?.value;
        App.updateBirdInput(a || 0, b || 0);
      };
    } catch (e) {
      console.error('renderGame 错误', e);
      safeRender(`<div class="card"><p>界面渲染错误：${e.message}</p></div>`);
    }
  }
};

window.onload = () => App.init();