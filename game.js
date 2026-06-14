// =============================================================
//  PhaserLab — Mario-like starter
//  Fixed logical canvas (1024×576) scaled to fill any screen.
//  HUD positions are in stable logical pixels — no pixel-ratio issues.
// =============================================================

const GW = 1024;          // logical game width
const GH = 576;           // logical game height
const GRAVITY    = 800;
const MOVE_SPEED = 220;
const JUMP_FORCE = 480;
const CONTROLS_H = 110;   // height reserved for touch controls
const GAMEPLAY_H = GH - CONTROLS_H;

// ── Game Over Scene ───────────────────────────────────────────
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.65);

    this.add.text(GW / 2, GH / 2 - 60, 'GAME OVER', {
      fontSize: '48px', fontFamily: 'monospace',
      fill: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(GW / 2, GH / 2 + 40, 220, 55, 0x4a90e2)
      .setInteractive({ useHandCursor: true });
    this.add.text(GW / 2, GH / 2 + 40, 'Play Again', {
      fontSize: '24px', fontFamily: 'monospace', fill: '#ffffff',
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x5aa0f2));
    btn.on('pointerout',  () => btn.setFillStyle(0x4a90e2));
    btn.on('pointerdown', () => {
      this.scene.stop('GameOver');
      this.scene.stop('GameScene');
      this.scene.start('GameScene');
    });
  }
}

// ── Main Game Scene ───────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    const makeRect = (key, w, h, color) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    makeRect('player',    24, 32, 0x4a90e2);
    makeRect('ground',  GW+200, 20, 0x5cb85c);
    makeRect('platform', 120, 16, 0xa0724a);
    makeRect('coin',      16, 16, 0xf5c518);
    makeRect('enemy',     24, 24, 0xe74c3c);
  }

  create() {
    this.cameras.main.setBackgroundColor('#3a7bd5');

    const WORLD_W = 3200;
    this.physics.world.setBounds(0, 0, WORLD_W, GAMEPLAY_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, GAMEPLAY_H);

    // ── Ground ───────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < WORLD_W; x += GW + 200) {
      this.platforms.create(x + (GW + 200) / 2, GAMEPLAY_H - 10, 'ground')
        .setScale(1, 1).refreshBody();
    }

    const platPositions = [
      [300,  GAMEPLAY_H - 130], [550,  GAMEPLAY_H - 200], [800,  GAMEPLAY_H - 130],
      [1050, GAMEPLAY_H - 240], [1300, GAMEPLAY_H - 150], [1550, GAMEPLAY_H - 240],
      [1800, GAMEPLAY_H - 180], [2050, GAMEPLAY_H - 260], [2300, GAMEPLAY_H - 160],
      [2600, GAMEPLAY_H - 240], [2900, GAMEPLAY_H - 130],
    ];
    platPositions.forEach(([x, y]) =>
      this.platforms.create(x, y, 'platform').refreshBody()
    );

    // ── Player ───────────────────────────────────────────────
    this.player = this.physics.add.sprite(400, GAMEPLAY_H - 80, 'player');
    this.player.setCollideWorldBounds(true).setBounce(0.1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Auto-run: start moving left
    this.moveDirection = -1;

    // ── Coins ────────────────────────────────────────────────
    this.coins = this.physics.add.staticGroup();
    [
      [300, GAMEPLAY_H-160], [330, GAMEPLAY_H-160], [360, GAMEPLAY_H-160],
      [550, GAMEPLAY_H-230], [580, GAMEPLAY_H-230],
      [1050, GAMEPLAY_H-270], [1080, GAMEPLAY_H-270], [1110, GAMEPLAY_H-270],
      [1550, GAMEPLAY_H-270], [1580, GAMEPLAY_H-270],
      [2050, GAMEPLAY_H-290], [2080, GAMEPLAY_H-290], [2110, GAMEPLAY_H-290],
      [2600, GAMEPLAY_H-270], [2630, GAMEPLAY_H-270],
    ].forEach(([x, y]) => this.coins.create(x, y, 'coin'));

    // ── Enemies ──────────────────────────────────────────────
    this.enemies = this.physics.add.group();
    [600, 1200, 1900, 2500].forEach(x => {
      const e = this.enemies.create(x, GAMEPLAY_H - 80, 'enemy');
      e.setCollideWorldBounds(true).setBounce(1, 0).setVelocityX(60);
    });
    this.physics.add.collider(this.enemies, this.platforms);

    // ── HUD — fixed logical positions ────────────────────────
    this.score = 0;
    this.lives = 3;

    // All three HUD elements share the same center Y — no misalignment.
    const HUD_Y = 38;

    // Coins: top-left, vertically centered on HUD_Y
    this.scoreText = this.add.text(16, HUD_Y, 'Coins: 0', {
      fontSize: '22px', fill: '#fff', fontFamily: 'monospace',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);

    // Lives: top-center, vertically centered on HUD_Y
    this.livesText = this.add.text(GW / 2, HUD_Y, 'Lives: 3', {
      fontSize: '22px', fill: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100);

    // Pause: top-right, rect and label both centered on HUD_Y
    this.pauseBtn = this.add.rectangle(GW - 68, HUD_Y, 110, 38, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(200).setInteractive({ useHandCursor: true });
    this.pauseLabel = this.add.text(GW - 68, HUD_Y, 'Pause', {
      fontSize: '18px', fontFamily: 'monospace', fill: '#fff',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(201);
    this.pauseBtn.on('pointerdown', () => this.togglePause());

    // ── Collisions ───────────────────────────────────────────
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.coins,   this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy,    null, this);

    // ── Keyboard ─────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    // ── Touch controls ───────────────────────────────────────
    this.touch = { left: false, right: false, jump: false };
    this._touchJumpConsumed = false;
    this.input.addPointer(2);
    this.createTouchControls();

    // ── State flags ──────────────────────────────────────────
    this.isPaused   = false;
    this.isGameOver = false;
    this.isInvincible = false;

    // ── Controls separator line ──────────────────────────────
    // Dark strip for controls area — pinned to bottom of logical canvas
    this.add.rectangle(GW / 2, GH - CONTROLS_H / 2, GW, CONTROLS_H, 0x000000, 0.22)
      .setScrollFactor(0).setDepth(40);
  }

  // ── Touch buttons (bottom-right triangle) ─────────────────
  createTouchControls() {
    const cx   = GW - 110;   // horizontal center of the cluster
    const botY = GH - 30;    // bottom row Y
    const topY = GH - 78;    // jump row Y (above)
    const r    = 30;

    const makeBtn = (x, y, label, onDown, onUp) => {
      this.add.circle(x, y, r, 0xffffff, 0.4)
        .setScrollFactor(0).setDepth(50).setInteractive();
      this.add.text(x, y, label, {
        fontSize: '20px', fontFamily: 'monospace', fill: '#fff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

      // attach events to the circle (last added interactive)
      const obj = this.children.getAt(this.children.length - 2);
      obj.on('pointerdown',   onDown);
      obj.on('pointerup',     onUp);
      obj.on('pointerout',    onUp);
      obj.on('pointercancel', onUp);
    };

    makeBtn(cx - 44, botY, '◀', () => this.touch.left  = true,  () => this.touch.left  = false);
    makeBtn(cx + 44, botY, '▶', () => this.touch.right = true,  () => this.touch.right = false);
    makeBtn(cx,      topY, '▲', () => this.touch.jump  = true,  () => this.touch.jump  = false);
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.world.pause();
      this.pauseLabel.setText('Resume');
      this.touch.left = this.touch.right = this.touch.jump = false;
    } else {
      this.physics.world.resume();
      this.pauseLabel.setText('Pause');
    }
  }

  collectCoin(player, coin) {
    coin.destroy();
    this.score++;
    this.scoreText.setText('Coins: ' + this.score);
  }

  hitEnemy(player, enemy) {
    if (this.isInvincible) return;
    const stomping = player.body.velocity.y > 0
                  && player.body.bottom < enemy.body.top + 10;
    if (stomping) {
      enemy.destroy();
      player.setVelocityY(-JUMP_FORCE * 0.7);
    } else {
      this.takeDamage();
    }
  }

  takeDamage() {
    if (this.isGameOver || this.isInvincible) return;
    this.lives--;
    this.livesText.setText('Lives: ' + this.lives);

    if (this.lives <= 0) {
      this.isGameOver = true;
      this.physics.world.pause();
      this.touch.left = this.touch.right = this.touch.jump = false;
      this.scene.launch('GameOver');
      return;
    }

    this.player.setPosition(400, GAMEPLAY_H - 80);
    this.player.setVelocity(0, 0);
    this.isInvincible = true;

    this.tweens.add({
      targets: this.player, alpha: 0,
      duration: 100, yoyo: true, repeat: 9,
      onComplete: () => {
        this.player.setAlpha(1);
        this.isInvincible = false;
      }
    });
  }

  update() {
    if (this.isPaused || this.isGameOver) return;

    const { cursors, wasd, player, touch } = this;
    const onGround = player.body.blocked.down;

    // Direction change only — movement is always on
    if (cursors.left.isDown  || wasd.left.isDown  || touch.left)  this.moveDirection = -1;
    if (cursors.right.isDown || wasd.right.isDown || touch.right) this.moveDirection =  1;

    player.setVelocityX(this.moveDirection * MOVE_SPEED);
    player.setFlipX(this.moveDirection < 0);

    // Keyboard jump
    const jumpKeyPressed = Phaser.Input.Keyboard.JustDown(cursors.up)
                        || Phaser.Input.Keyboard.JustDown(wasd.up)
                        || Phaser.Input.Keyboard.JustDown(wasd.space);
    if (jumpKeyPressed && onGround) player.setVelocityY(-JUMP_FORCE);

    // Touch jump (one-shot per press)
    if (touch.jump && !this._touchJumpConsumed && onGround) {
      player.setVelocityY(-JUMP_FORCE);
      this._touchJumpConsumed = true;
    }
    if (!touch.jump) this._touchJumpConsumed = false;

    // Fall off bottom of gameplay area → damage
    if (player.y > GAMEPLAY_H + 40) this.takeDamage();

    // Enemy patrol: reverse at world bounds
    this.enemies.getChildren().forEach(e => {
      if (e.body.blocked.left)  e.setVelocityX( 60);
      if (e.body.blocked.right) e.setVelocityX(-60);
    });
  }
}

// ── Phaser config ─────────────────────────────────────────────
// Fixed logical resolution + FIT scaling = HUD always at correct
// logical coords. Body background matches sky so bars are invisible.
const config = {
  type: Phaser.AUTO,
  backgroundColor: '#3a7bd5',
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
  scene: [GameScene, GameOverScene],
};

new Phaser.Game(config);
