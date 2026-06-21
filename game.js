// =============================================================
//  PhaserLab — kid-friendly Mario-like platformer
//  Target player: ~5 years old. Target device: touchscreen, no keyboard
//  (keyboard kept working for desktop testing).
//
//  Fixed logical canvas (GW x GH) + FIT scaling + parent:'game'
//  => HUD lives in stable logical pixels and the canvas always mounts
//     inside the centered #game div (never pushed off-screen).
// =============================================================

// ── Tunables ──────────────────────────────────────────────────
const GW = 1024;          // logical game width
const GH = 576;           // logical game height
const GRAVITY     = 900;
const MOVE_SPEED  = 140;
const JUMP_FORCE  = 480;
const JUMP_CUT    = 0.40; // velocity kept when jump released early (variable height)
const COYOTE_MS   = 120;  // grace window to still jump after leaving a ledge
const BUFFER_MS   = 140;  // jump pressed slightly before landing still fires
const LEDGE_GRAB  = 28;   // px - bottom overlap that triggers auto-climb onto a ledge

const VERSION = '2.0';
const SUPER_STAR_SPEED = 58;

const CONTROLS_H  = 150;  // bottom strip reserved for big touch buttons
const GAMEPLAY_H  = GH - CONTROLS_H;
const WORLD_W     = 3400;

// Friendly palette
const C = {
  sky:    '#5b8dd9',
  ground: 0x6cbf5a,
  dirt:   0x4a8f3c,
  plat:   0xc98a4b,
  coin:   0xffd23f,
  enemy:  0xe8553c,
  player: 0xff6eb4,
  goal:   0xffd23f,
};

// ── Boot helpers shared across scenes ─────────────────────────
function makeTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // player: rounded pink body with a friendly face
  g.clear();
  g.fillStyle(C.player); g.fillRoundedRect(0, 0, 40, 46, 10);
  g.fillStyle(0xffffff); g.fillCircle(13, 16, 6); g.fillCircle(27, 16, 6);
  g.fillStyle(0x222222); g.fillCircle(14, 17, 3); g.fillCircle(28, 17, 3);
  g.generateTexture('player', 40, 46);

  // ground tile
  g.clear();
  g.fillStyle(C.dirt);   g.fillRect(0, 0, 64, 64);
  g.fillStyle(C.ground); g.fillRect(0, 0, 64, 16);
  g.generateTexture('ground', 64, 64);

  // floating platform
  g.clear();
  g.fillStyle(0x8a5a2b); g.fillRoundedRect(0, 0, 220, 28, 8);
  g.fillStyle(C.plat);   g.fillRoundedRect(0, 0, 220, 14, 8);
  g.generateTexture('platform', 220, 28);

  // coin
  g.clear();
  g.fillStyle(0xc8941f); g.fillCircle(16, 16, 16);
  g.fillStyle(C.coin);   g.fillCircle(16, 16, 12);
  g.fillStyle(0xfff3b0); g.fillCircle(12, 12, 4);
  g.generateTexture('coin', 32, 32);

  // enemy: red blob with eyes
  g.clear();
  g.fillStyle(C.enemy);  g.fillRoundedRect(0, 0, 40, 34, 12);
  g.fillStyle(0xffffff); g.fillCircle(13, 14, 6); g.fillCircle(27, 14, 6);
  g.fillStyle(0x222222); g.fillCircle(13, 15, 3); g.fillCircle(27, 15, 3);
  g.generateTexture('enemy', 40, 34);

  // goal star
  g.clear();
  g.fillStyle(C.goal);
  const cx = 28, cy = 28, R = 26, r = 11, pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
  }
  g.fillPoints(pts, true);
  g.generateTexture('goal', 56, 56);

  // super star — bright gold + white glow, must pop on grass/enemies
  g.clear();
  const drawStar = (cx, cy, R, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? R : r;
      pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
    }
    g.fillPoints(pts, true);
  };
  g.fillStyle(0xfff9c4, 0.9); g.fillCircle(36, 36, 34);
  g.fillStyle(0xffee58, 0.75); g.fillCircle(36, 36, 26);
  g.fillStyle(0xffffff);       drawStar(36, 36, 30, 12);
  g.fillStyle(0xffd600);       drawStar(36, 36, 25, 10);
  g.fillStyle(0xfff176);       drawStar(36, 36, 17, 7);
  g.fillStyle(0xffffff); g.fillCircle(27, 27, 7);
  g.fillStyle(0xffffff); g.fillCircle(46, 30, 4);
  g.fillStyle(0xffffff); g.fillCircle(33, 50, 3);
  g.generateTexture('superstar', 72, 72);

  g.destroy();
}

// ── Sound effects (Web Audio API — no external files needed) ───
// AudioContext is lazy-created on first user gesture to satisfy
// browser autoplay policy.
const SFX = (() => {
  let ctx = null;
  const get = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };
  const tone = (freq, freqEnd, type, dur, vol) => {
    try {
      const c = get();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.28, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(c.currentTime);
      o.stop(c.currentTime + dur + 0.01);
    } catch (_) {}
  };
  return {
    coin:   () => tone(880, 1320, 'sine',     0.14, 0.22),
    jump:   () => tone(260, 380,  'sine',     0.10, 0.14),
    bounce: () => tone(420, 560,  'square',   0.12, 0.18),
    damage: () => tone(240, 100,  'sawtooth', 0.28, 0.28),
    win:    () => {
      tone(523, 523, 'sine', 0.14, 0.28);
      setTimeout(() => tone(659, 659, 'sine', 0.14, 0.28), 150);
      setTimeout(() => tone(784, 784, 'sine', 0.22, 0.32), 300);
    },
    superStar: () => {
      tone(660, 990, 'sine', 0.12, 0.26);
      setTimeout(() => tone(990, 1320, 'sine', 0.18, 0.30), 100);
    },
  };
})();

// ── Level data ────────────────────────────────────────────────
// Optional superStar (x on ground): patrols like a Mario mushroom among
// enemies — chase it for ×2 stars; skip it and keep playing normally.
const LEVELS = [
  {
    platW: 220,
    plats: [
      [300,  GAMEPLAY_H - 120], [520,  GAMEPLAY_H - 170], [740,  GAMEPLAY_H - 120],
      [960,  GAMEPLAY_H - 190], [1180, GAMEPLAY_H - 130], [1400, GAMEPLAY_H - 190],
      [1620, GAMEPLAY_H - 150], [1840, GAMEPLAY_H - 200], [2060, GAMEPLAY_H - 140],
      [2300, GAMEPLAY_H - 190], [2540, GAMEPLAY_H - 120], [2780, GAMEPLAY_H - 170],
    ],
    coins: [
      [270, -165], [300, -165], [330, -165],
      [500, -215], [530, -215],
      [930, -235], [960, -235], [990, -235],
      [1370, -235], [1400, -235],
      [1810, -245], [1840, -245], [1870, -245],
      [2270, -235], [2300, -235],
    ],
    enemies: [620, 1240, 1920, 2560],
    superStar: 900,
  },
  {
    platW: 200,
    plats: [
      [290,  GAMEPLAY_H - 135], [525,  GAMEPLAY_H - 185], [760,  GAMEPLAY_H - 135],
      [995,  GAMEPLAY_H - 205], [1230, GAMEPLAY_H - 145], [1465, GAMEPLAY_H - 205],
      [1700, GAMEPLAY_H - 165], [1935, GAMEPLAY_H - 215], [2170, GAMEPLAY_H - 150],
      [2415, GAMEPLAY_H - 205], [2660, GAMEPLAY_H - 135], [2905, GAMEPLAY_H - 180],
    ],
    coins: [
      [260, -180], [290, -180], [320, -180],
      [505, -230], [535, -230],
      [965, -250], [995, -250], [1025, -250],
      [1435, -250], [1465, -250],
      [1905, -260], [1935, -260], [1965, -260],
      [2385, -250], [2415, -250],
    ],
    enemies: [600, 1200, 1860, 2480, 3050],
    superStar: 1050,
  },
  {
    platW: 180,
    plats: [
      [280,  GAMEPLAY_H - 150], [530,  GAMEPLAY_H - 205], [780,  GAMEPLAY_H - 150],
      [1035, GAMEPLAY_H - 225], [1285, GAMEPLAY_H - 160], [1540, GAMEPLAY_H - 225],
      [1790, GAMEPLAY_H - 180], [2050, GAMEPLAY_H - 235], [2305, GAMEPLAY_H - 165],
      [2570, GAMEPLAY_H - 225], [2830, GAMEPLAY_H - 150], [3080, GAMEPLAY_H - 195],
    ],
    coins: [
      [250, -195], [280, -195], [310, -195],
      [510, -250], [540, -250],
      [1005, -270], [1035, -270], [1065, -270],
      [1510, -270], [1540, -270],
      [2020, -280], [2050, -280], [2080, -280],
      [2540, -270], [2570, -270],
    ],
    enemies: [560, 1100, 1700, 2300, 2900, 3150],
    superStar: 1450,
  },
];

// ── Main Game Scene ───────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.levelNum = (data && data.level) || 1;
  }

  preload() { makeTextures(this); }

  create() {
    this.cameras.main.setBackgroundColor(C.sky);

    this.physics.world.setBounds(0, 0, WORLD_W, GAMEPLAY_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, GAMEPLAY_H);

    this.buildClouds();
    this.buildLevel();
    this.buildPlayer();
    this.buildHUD();
    this.buildInput();
    this.buildTouchControls();

    // Feel-state
    this.lastGroundedAt = -9999;
    this.jumpBufferedAt = -9999;
    this.jumpHeld = false;

    // Run-state
    this.score = 0;
    this.lives = 3;
    this.isPaused = false;
    this.isGameOver = false;
    this.isWin = false;
    this.isInvincible = false;
    this.moveDirection = -1;     // auto-run starts moving left
    this.spawnPoint = { x: 220, y: GAMEPLAY_H - 120 };
    this.superStarCollected = false;
  }

  // ─── Decorative parallax clouds ───
  buildClouds() {
    for (let i = 0; i < 10; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(40, 200);
      const s = Phaser.Math.FloatBetween(0.6, 1.4);
      const cloud = this.add.ellipse(x, y, 120 * s, 50 * s, 0xffffff, 0.85)
        .setScrollFactor(0.4).setDepth(0);
      cloud._sf = 0.4; // marker (unused, kept for clarity)
    }
  }

  buildLevel() {
    const lvl = LEVELS[this.levelNum - 1];

    // Continuous ground
    this.platforms = this.physics.add.staticGroup();
    for (let x = 32; x < WORLD_W; x += 64) {
      this.platforms.create(x, GAMEPLAY_H - 32, 'ground').refreshBody();
    }

    // Floating platforms — width comes from level data
    lvl.plats.forEach(([x, y]) => {
      const p = this.platforms.create(x, y, 'platform');
      p.setDisplaySize(lvl.platW, 28).refreshBody();
    });

    // Coins
    this.coins = this.physics.add.staticGroup();
    lvl.coins.forEach(([x, dy]) => {
      const c = this.coins.create(x, GAMEPLAY_H + dy, 'coin');
      this.tweens.add({ targets: c, y: c.y - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });

    // Enemies
    this.enemies = this.physics.add.group();
    lvl.enemies.forEach(x => {
      const e = this.enemies.create(x, GAMEPLAY_H - 90, 'enemy');
      e.setCollideWorldBounds(true).setVelocityX(70).setBounceX(1);
      e.body.setAllowGravity(true);
    });
    this.physics.add.collider(this.enemies, this.platforms);

    // Super star — patrols the ground among enemies (Mario mushroom)
    this.superStar = null;
    this.superStarGlow = null;
    if (lvl.superStar) {
      const sy = GAMEPLAY_H - 98;
      this.superStarGlow = this.add.circle(lvl.superStar, sy, 44, 0xfff200, 0.4).setDepth(18);
      this.tweens.add({
        targets: this.superStarGlow, scale: 1.5, alpha: 0.12,
        duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      this.superStar = this.physics.add.sprite(lvl.superStar, sy, 'superstar');
      this.superStar.setScale(1.4).setDepth(20);
      this.superStar.setBounce(0).setCollideWorldBounds(true).setBounceX(1);
      this.superStar.body.setAllowGravity(true);
      this.superStar.body.setSize(50, 50);
      this.superStar.setVelocityX(SUPER_STAR_SPEED);
      this.physics.add.collider(this.superStar, this.platforms);
      this.tweens.add({ targets: this.superStar, angle: 360, duration: 2000, repeat: -1 });
      this.tweens.add({
        targets: this.superStar, scale: 1.65, duration: 320,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }

    // Goal star
    this.goal = this.physics.add.staticSprite(WORLD_W - 80, GAMEPLAY_H - 90, 'goal');
    this.tweens.add({ targets: this.goal, angle: 360, duration: 4000, repeat: -1 });
    this.tweens.add({ targets: this.goal, scale: 1.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  buildPlayer() {
    this.player = this.physics.add.sprite(220, GAMEPLAY_H - 120, 'player');
    this.player.setCollideWorldBounds(true).setBounce(0);
    this.player.body.setSize(36, 44);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.physics.add.collider(this.player, this.platforms, this.onPlatformCollide, null, this);
    this.physics.add.overlap(this.player, this.coins,   this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy,    null, this);
    this.physics.add.overlap(this.player, this.goal,    this.reachGoal,   null, this);
    if (this.superStar) {
      this.physics.add.overlap(this.player, this.superStar, this.collectSuperStar, null, this);
    }
  }

  // ─── Ledge climb: fires while collision is still live ───
  onPlatformCollide(player, plat) {
    const b  = player.body;
    const pb = plat.body;
    if (b.blocked.down) return; // normal landing — skip
    if (!b.blocked.left && !b.blocked.right) return;
    const climbDepth = b.bottom - pb.top;
    if (climbDepth > 0 && climbDepth <= LEDGE_GRAB) {
      player.y -= climbDepth + 2;
      player.setVelocityY(-220);          // small upward pop
      this.lastGroundedAt = this.time.now; // allow immediate jump from new surface
    }
  }

  // ─── HUD: icon-led so a non-reader can parse it ───
  buildHUD() {
    const HUD_Y = 40;

    // Coins: icon + number, top-left
    this.add.image(34, HUD_Y, 'coin').setScale(1.1).setScrollFactor(0).setDepth(100);
    this.scoreText = this.add.text(58, HUD_Y, '0', {
      fontSize: '34px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#1a3a6b', strokeThickness: 6,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);

    // Lives: hearts, top-center
    this.hearts = [];
    const startX = GW / 2 - 44;
    for (let i = 0; i < 3; i++) {
      const h = this.add.text(startX + i * 44, HUD_Y, '\u2665', {
        fontSize: '38px', color: '#ff4d6d', stroke: '#7a0020', strokeThickness: 4,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
      this.hearts.push(h);
    }

    // Level badge: top-center below hearts
    this.add.text(GW / 2, HUD_Y + 30, 'LVL ' + this.levelNum, {
      fontSize: '16px', fontFamily: 'monospace', color: '#ffffffaa',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    // Version: bottom-left corner, small, dimmed
    this.add.text(8, GH - CONTROLS_H - 4, 'v' + VERSION, {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', alpha: 0.4,
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(100);

    // Pause: big icon button, top-right
    this.pauseBtn = this.add.circle(GW - 44, HUD_Y, 30, 0x000000, 0.45)
      .setScrollFactor(0).setDepth(200).setInteractive({ useHandCursor: true });
    this.pauseIcon = this.add.text(GW - 44, HUD_Y, '\u23F8', {
      fontSize: '30px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    this.pauseBtn.on('pointerdown', () => this.togglePause());
  }

  buildInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.touch = { left: false, right: false, jump: false };
    this.input.addPointer(3); // allow several fingers at once
  }

  // ─── Big, well-spaced touch buttons inside the bottom strip ───
  buildTouchControls() {
    // Strip background
    this.add.rectangle(GW / 2, GH - CONTROLS_H / 2, GW, CONTROLS_H, 0x0a1d3a, 0.28)
      .setScrollFactor(0).setDepth(40);

    const cy = GH - CONTROLS_H / 2;
    const R = 52; // ~big enough for a small finger

    const makeBtn = (x, label, key) => {
      const circle = this.add.circle(x, cy, R, 0xffffff, 0.30)
        .setScrollFactor(0).setDepth(50)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, cy, label, {
        fontSize: '40px', color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

      const press = () => { this.touch[key] = true;  circle.setFillStyle(0xffffff, 0.55); };
      const release = () => { this.touch[key] = false; circle.setFillStyle(0xffffff, 0.30); };
      circle.on('pointerdown', press);
      circle.on('pointerup', release);
      circle.on('pointerout', release);
      circle.on('pointerupoutside', release);
      circle.on('pointercancel', release);
    };

    // Left / Right on the left, Jump on the right (classic, easy for kids)
    makeBtn(90,        '\u25C0', 'left');
    makeBtn(232,       '\u25B6', 'right');
    makeBtn(GW - 110,  '\u25B2', 'jump');
  }

  // ─── Feedback-rich interactions ───
  collectCoin(player, coin) {
    if (!coin.active) return;
    coin.disableBody(true, false);
    this.tweens.add({
      targets: coin, y: coin.y - 30, alpha: 0, scale: 1.6,
      duration: 220, onComplete: () => coin.destroy(),
    });
    this.score++;
    this.scoreText.setText('' + this.score);
    this.tweens.add({ targets: this.scoreText, scale: 1.4, duration: 110, yoyo: true });
    SFX.coin();
  }

  collectSuperStar(player, star) {
    if (!star.active || this.superStarCollected) return;
    this.superStarCollected = true;
    star.disableBody(true, false);
    this.score *= 2;
    this.scoreText.setText('' + this.score);
    this.tweens.add({ targets: this.scoreText, scale: 1.8, duration: 200, yoyo: true });
    if (this.superStarGlow) {
      this.tweens.add({
        targets: this.superStarGlow, scale: 2.5, alpha: 0,
        duration: 300, onComplete: () => { this.superStarGlow.destroy(); this.superStarGlow = null; },
      });
    }
    const flash = this.add.text(GW / 2, 42, '\u00D72', {
      fontSize: '42px', fontFamily: 'Arial Black, sans-serif',
      color: '#ff4da6', stroke: '#ffffff', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150).setAlpha(0);
    this.tweens.add({
      targets: flash, alpha: 1, y: 22, duration: 350,
      yoyo: true, onComplete: () => flash.destroy(),
    });
    this.tweens.add({
      targets: star, scale: 2.2, alpha: 0, duration: 280,
      onComplete: () => star.destroy(),
    });
    SFX.superStar();
  }

  hitEnemy(player, enemy) {
    if (this.isInvincible || !enemy.active) return;
    const stomping = player.body.velocity.y > 0 &&
                     player.body.bottom < enemy.body.top + 14;
    if (stomping) {
      enemy.disableBody(true, false);
      this.tweens.add({
        targets: enemy, scaleY: 0.2, alpha: 0,
        duration: 160, onComplete: () => enemy.destroy(),
      });
      player.setVelocityY(-JUMP_FORCE * 0.65);
      SFX.bounce();
    } else {
      this.takeDamage();
    }
  }

  takeDamage() {
    if (this.isGameOver || this.isWin || this.isInvincible) return;
    this.lives--;
    this.refreshHearts();
    this.cameras.main.shake(180, 0.012);

    if (this.lives <= 0) {
      this.endGame('GameOver');
      return;
    }

    SFX.damage();
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.setVelocity(0, 0);
    this.moveDirection = -1;
    this.isInvincible = true;
    this.tweens.add({
      targets: this.player, alpha: 0.25, duration: 120, yoyo: true, repeat: 7,
      onComplete: () => { this.player.setAlpha(1); this.isInvincible = false; },
    });
  }

  reachGoal() {
    if (this.isWin || this.isGameOver) return;
    SFX.win();
    this.endGame('Win');
  }

  refreshHearts() {
    this.hearts.forEach((h, i) => h.setAlpha(i < this.lives ? 1 : 0.18));
  }

  endGame(sceneKey) {
    if (sceneKey === 'Win') this.isWin = true; else this.isGameOver = true;
    this.physics.world.pause();
    this.touch.left = this.touch.right = this.touch.jump = false;
    this.scene.launch('EndScene', { win: sceneKey === 'Win', score: this.score, level: this.levelNum });
    this.scene.bringToTop('EndScene');
  }

  togglePause() {
    if (this.isGameOver || this.isWin) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.world.pause();
      this.pauseIcon.setText('\u25B6');
      this.touch.left = this.touch.right = this.touch.jump = false;
    } else {
      this.physics.world.resume();
      this.pauseIcon.setText('\u23F8');
    }
  }

  update(time) {
    if (this.isPaused || this.isGameOver || this.isWin) return;

    const { cursors, wasd, player, touch } = this;
    const onGround = player.body.blocked.down;
    if (onGround) this.lastGroundedAt = time;

    // Auto-run: direction only changes on input, movement never stops
    if (cursors.left.isDown  || wasd.left.isDown  || touch.left)  this.moveDirection = -1;
    if (cursors.right.isDown || wasd.right.isDown || touch.right) this.moveDirection =  1;
    player.setVelocityX(this.moveDirection * MOVE_SPEED);
    player.setFlipX(this.moveDirection < 0);

    // Jump input (keyboard edge OR touch edge) -> buffer it
    const kbJump = Phaser.Input.Keyboard.JustDown(cursors.up) ||
                   Phaser.Input.Keyboard.JustDown(wasd.up) ||
                   Phaser.Input.Keyboard.JustDown(wasd.space);
    const touchJumpEdge = touch.jump && !this.jumpHeld;
    if (kbJump || touchJumpEdge) this.jumpBufferedAt = time;
    this.jumpHeld = touch.jump;

    // Fire jump if buffered AND (grounded or within coyote window)
    const buffered = (time - this.jumpBufferedAt) <= BUFFER_MS;
    const coyote   = (time - this.lastGroundedAt) <= COYOTE_MS;
    if (buffered && coyote) {
      player.setVelocityY(-JUMP_FORCE);
      this.jumpBufferedAt = -9999;
      this.lastGroundedAt = -9999;
      SFX.jump();
    }

    // Variable jump height: releasing jump early cuts the rise
    const jumpDown = cursors.up.isDown || wasd.up.isDown || wasd.space.isDown || touch.jump;
    if (!jumpDown && player.body.velocity.y < 0) {
      player.setVelocityY(player.body.velocity.y * JUMP_CUT);
    }

    // Auto-reverse at the left world boundary
    if (player.body.x <= 0) this.moveDirection = 1;

    // Fall off the bottom -> lose a life
    if (player.y > GAMEPLAY_H + 60) this.takeDamage();

    // Enemy patrol: reverse at walls
    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      if (e.body.blocked.left)  e.setVelocityX(Math.abs(e.body.velocity.x) || 70);
      if (e.body.blocked.right) e.setVelocityX(-Math.abs(e.body.velocity.x) || -70);
    });

    // Super star patrol: Mario-mushroom walk on the ground
    if (this.superStar && this.superStar.active) {
      const s = this.superStar;
      if (s.body.blocked.left)  s.setVelocityX(SUPER_STAR_SPEED);
      if (s.body.blocked.right) s.setVelocityX(-SUPER_STAR_SPEED);
      if (this.superStarGlow) this.superStarGlow.setPosition(s.x, s.y);
    }
  }
}

// ── Shared helper: draw 3 traffic-light level buttons ──────────
const LEVEL_COLORS = [0x44c767, 0xf5a623, 0xe8553c];

function buildLevelButtons(scene, btnY, onPick) {
  const xs = [GW / 2 - 180, GW / 2, GW / 2 + 180];
  [1, 2, 3].forEach((num, i) => {
    const x = xs[i];
    const circle = scene.add.circle(x, btnY, 68, LEVEL_COLORS[i])
      .setInteractive({ useHandCursor: true });
    scene.add.text(x, btnY, String(num), {
      fontSize: '60px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
      stroke: '#00000055', strokeThickness: 5,
    }).setOrigin(0.5);
    scene.tweens.add({ targets: circle, scale: 1.07, duration: 650 + i * 80, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    circle.on('pointerdown', () => onPick(num));
  });
}

// ── End Scene (Game Over / Win) ────────────────────────────────
class EndScene extends Phaser.Scene {
  constructor() { super('EndScene'); }

  create(data) {
    const win = !!(data && data.win);

    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.65);

    this.add.text(GW / 2, GH / 2 - 140, win ? '\u2B50' : '\uD83D\uDE22', {
      fontSize: '80px',
    }).setOrigin(0.5);

    this.add.text(GW / 2, GH / 2 - 60, win ? 'YOU WIN!' : 'TRY AGAIN', {
      fontSize: '52px', fontFamily: 'Arial Black, sans-serif',
      color: win ? '#ffd23f' : '#ff6b6b', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5);

    // "Choose a level" hint — icon only, no text needed for a 5-year-old
    this.add.text(GW / 2, GH / 2 + 10, '\uD83C\uDFAE', {
      fontSize: '36px',
    }).setOrigin(0.5);

    buildLevelButtons(this, GH / 2 + 110, (num) => {
      this.scene.stop('EndScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene', { level: num });
    });
  }
}

// ── Level Select Scene ─────────────────────────────────────────
class LevelSelectScene extends Phaser.Scene {
  constructor() { super('LevelSelectScene'); }

  create() {
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x3a6bbf);

    // Clouds
    for (let i = 0; i < 6; i++) {
      this.add.ellipse(
        Phaser.Math.Between(80, GW - 80),
        Phaser.Math.Between(40, 180),
        Phaser.Math.Between(100, 190), 44, 0xffffff, 0.7
      );
    }

    this.add.text(GW / 2, 90, '\u2B50', { fontSize: '72px' }).setOrigin(0.5);

    buildLevelButtons(this, GH / 2 + 40, (num) => {
      this.scene.start('GameScene', { level: num });
    });

    this.add.text(8, GH - 6, 'v' + VERSION, {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff66',
    }).setOrigin(0, 1);
  }
}

// ── Phaser config ─────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  parent: 'game',              // <-- mounts the canvas inside the centered div
  backgroundColor: C.sky,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GW,
    height: GH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: GRAVITY }, debug: false },
  },
  scene: [LevelSelectScene, GameScene, EndScene],
};

new Phaser.Game(config);
