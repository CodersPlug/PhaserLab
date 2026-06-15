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
const GRAVITY     = 1300;
const MOVE_SPEED  = 200;
const JUMP_FORCE  = 600;
const JUMP_CUT    = 0.40; // velocity kept when jump released early (variable height)
const COYOTE_MS   = 120;  // grace window to still jump after leaving a ledge
const BUFFER_MS   = 140;  // jump pressed slightly before landing still fires
const LEDGE_GRAB  = 28;   // px - bottom overlap that triggers auto-climb onto a ledge

const VERSION = '1.2';

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
  player: 0x3d7fe6,
  goal:   0xffd23f,
};

// ── Boot helpers shared across scenes ─────────────────────────
function makeTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // player: rounded blue body with a friendly face
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
  g.fillStyle(0x8a5a2b); g.fillRoundedRect(0, 0, 140, 28, 8);
  g.fillStyle(C.plat);   g.fillRoundedRect(0, 0, 140, 14, 8);
  g.generateTexture('platform', 140, 28);

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

  g.destroy();
}

// ── Main Game Scene ───────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

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
    // Continuous ground built from 64px tiles
    this.platforms = this.physics.add.staticGroup();
    for (let x = 32; x < WORLD_W; x += 64) {
      this.platforms.create(x, GAMEPLAY_H - 32, 'ground').refreshBody();
    }

    const plats = [
      [320,  GAMEPLAY_H - 140], [560,  GAMEPLAY_H - 215], [820,  GAMEPLAY_H - 150],
      [1080, GAMEPLAY_H - 240], [1340, GAMEPLAY_H - 160], [1600, GAMEPLAY_H - 240],
      [1860, GAMEPLAY_H - 180], [2120, GAMEPLAY_H - 260], [2380, GAMEPLAY_H - 170],
      [2680, GAMEPLAY_H - 240], [2980, GAMEPLAY_H - 150],
    ];
    plats.forEach(([x, y]) => this.platforms.create(x, y, 'platform').refreshBody());

    // Coins (above platforms and along the path)
    this.coins = this.physics.add.staticGroup();
    const coinSpots = [
      [320, -185], [355, -185], [390, -185],
      [560, -260], [595, -260],
      [1080, -290], [1115, -290], [1150, -290],
      [1600, -290], [1635, -290],
      [2120, -310], [2155, -310], [2190, -310],
      [2680, -290], [2715, -290],
    ];
    coinSpots.forEach(([x, dy]) => {
      const c = this.coins.create(x, GAMEPLAY_H + dy, 'coin');
      this.tweens.add({ targets: c, y: c.y - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });

    // Enemies patrol the ground
    this.enemies = this.physics.add.group();
    [620, 1240, 1920, 2560].forEach(x => {
      const e = this.enemies.create(x, GAMEPLAY_H - 90, 'enemy');
      e.setCollideWorldBounds(true).setVelocityX(70).setBounceX(1);
      e.body.setAllowGravity(true);
    });
    this.physics.add.collider(this.enemies, this.platforms);

    // Goal star at the far right
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
      player.setVelocityY(-JUMP_FORCE * 0.6); // bounce
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
    this.endGame('Win');
  }

  refreshHearts() {
    this.hearts.forEach((h, i) => h.setAlpha(i < this.lives ? 1 : 0.18));
  }

  endGame(sceneKey) {
    if (sceneKey === 'Win') this.isWin = true; else this.isGameOver = true;
    this.physics.world.pause();
    this.touch.left = this.touch.right = this.touch.jump = false;
    this.scene.launch('EndScene', { win: sceneKey === 'Win', score: this.score });
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
      if (e.body.blocked.left)  e.setVelocityX(70);
      if (e.body.blocked.right) e.setVelocityX(-70);
    });
  }
}

// ── End Scene (Game Over / Win) — big friendly button ─────────
class EndScene extends Phaser.Scene {
  constructor() { super('EndScene'); }

  create(data) {
    const win = !!(data && data.win);
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.6);

    this.add.text(GW / 2, GH / 2 - 90, win ? '\u2B50' : '\uD83D\uDE22', {
      fontSize: '90px',
    }).setOrigin(0.5);

    this.add.text(GW / 2, GH / 2 - 10, win ? 'YOU WIN!' : 'TRY AGAIN', {
      fontSize: '56px', fontFamily: 'Arial Black, sans-serif',
      color: win ? '#ffd23f' : '#ff6b6b', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5);

    // Big play-again button (green = go)
    const btn = this.add.circle(GW / 2, GH / 2 + 110, 60, 0x44c767)
      .setInteractive({ useHandCursor: true });
    this.add.text(GW / 2, GH / 2 + 110, '\u25B6', {
      fontSize: '54px', color: '#ffffff',
    }).setOrigin(0.5);
    this.tweens.add({ targets: btn, scale: 1.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    btn.on('pointerdown', () => {
      this.scene.stop('EndScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene');
    });
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
  scene: [GameScene, EndScene],
};

new Phaser.Game(config);
