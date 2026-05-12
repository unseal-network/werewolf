import Phaser from "phaser";
import type { EngineGameState, EngineRoleCardState } from "../GameEngine";

export abstract class BaseScene extends Phaser.Scene {
  protected gameState: EngineGameState = {
    scene: "lobby",
    phase: null,
    seats: [],
    selectedTargetId: null,
  };
  private roleReveal: Phaser.GameObjects.Container | undefined;
  private roleBackdrop: Phaser.GameObjects.Rectangle | undefined;
  private roleCardNonce = 0;
  private roleTextureRequest: string | undefined;

  init(data?: { gameState?: EngineGameState }) {
    if (data?.gameState) {
      this.gameState = data.gameState;
    }
  }

  updateGameState(state: EngineGameState) {
    this.gameState = state;
    this.onStateUpdate();
    this.updateRoleCardReveal(state.roleCard);
  }

  protected onStateUpdate(): void {
    // Override in subclasses
  }

  protected bootRoleCardLayer(): void {
    this.updateRoleCardReveal(this.gameState.roleCard);
  }

  private updateRoleCardReveal(roleCard: EngineRoleCardState | undefined): void {
    if (!this.sys.isActive()) return;
    if (!roleCard?.visible || roleCard.nonce <= 0) {
      if (this.roleReveal) {
        this.dismissRoleReveal();
      }
      return;
    }
    if (roleCard.nonce === this.roleCardNonce && this.roleReveal) {
      return;
    }
    this.roleCardNonce = roleCard.nonce;
    this.ensureRoleTextures(roleCard, () => this.showRoleReveal(roleCard));
  }

  private ensureRoleTextures(roleCard: EngineRoleCardState, done: () => void): void {
    const missing: Array<[string, string]> = [];
    if (!this.textures.exists("role-card-back")) {
      missing.push(["role-card-back", roleCard.cardBackUrl]);
    }
    const frontKey = this.roleFrontKey(roleCard.roleId);
    if (!this.textures.exists(frontKey)) {
      missing.push([frontKey, roleCard.cardFrontUrl]);
    }
    if (missing.length === 0) {
      done();
      return;
    }
    const requestId = `${roleCard.nonce}:${missing.map(([key]) => key).join(",")}`;
    if (this.roleTextureRequest === requestId) return;
    this.roleTextureRequest = requestId;
    for (const [key, url] of missing) {
      this.load.image(key, url);
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.roleTextureRequest = undefined;
      done();
    });
    this.load.start();
  }

  private showRoleReveal(roleCard: EngineRoleCardState): void {
    this.dismissRoleReveal(true);

    const { width, height } = this.scale;
    const cardWidth = Math.min(330, width * 0.26);
    const cardHeight = cardWidth * 1.5;
    const startX = Math.max(72, width * 0.08);
    const startY = Math.max(90, height - 112);
    const centerX = width / 2;
    const centerY = height / 2;
    const frontKey = this.roleFrontKey(roleCard.roleId);

    const backdrop = this.add
      .rectangle(width / 2, height / 2, width, height, 0x02080b, 0)
      .setDepth(9000);
    backdrop.setInteractive();
    backdrop.on("pointerdown", () => this.game.events.emit("role-card-close"));
    this.roleBackdrop = backdrop;
    this.tweens.add({
      targets: backdrop,
      alpha: 0.68,
      duration: 220,
      ease: "Sine.easeOut",
    });

    const container = this.add.container(startX, startY).setDepth(9010);
    container.setScale(0.18);
    this.roleReveal = container;

    const card = this.add.image(0, 0, "role-card-back");
    card.setDisplaySize(cardWidth, cardHeight);
    card.setOrigin(0.5);
    card.setInteractive();
    card.on("pointerdown", () => this.game.events.emit("role-card-close"));
    container.add(card);

    const glow = this.add
      .ellipse(0, 0, cardWidth * 1.24, cardHeight * 1.08, 0x82e0d6, 0.08)
      .setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(-1);
    container.addAt(glow, 0);

    const title = this.add
      .text(0, cardHeight * 0.34, roleCard.roleLabel, {
        fontFamily: "Noto Sans SC, PingFang SC, sans-serif",
        fontSize: "34px",
        color: "#fff3c7",
        fontStyle: "bold",
        align: "center",
        stroke: "#120d08",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    container.add(title);

    const description = this.add
      .text(0, cardHeight * 0.44, roleCard.roleDescription, {
        fontFamily: "Noto Sans SC, PingFang SC, sans-serif",
        fontSize: "16px",
        color: "#f5ead1",
        align: "center",
        wordWrap: { width: cardWidth * 0.76 },
        lineSpacing: 5,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    container.add(description);

    const closeHint = this.add
      .text(0, cardHeight * 0.62, "点击卡牌收起", {
        fontFamily: "Noto Sans SC, PingFang SC, sans-serif",
        fontSize: "14px",
        color: "#d8c593",
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    container.add(closeHint);

    this.tweens.add({
      targets: container,
      x: centerX,
      y: centerY,
      scale: 1,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: card,
          scaleX: 0.02,
          duration: 170,
          ease: "Sine.easeIn",
          onComplete: () => {
            card.setTexture(frontKey);
            card.setDisplaySize(cardWidth, cardHeight);
            this.tweens.add({
              targets: card,
              scaleX: 1,
              duration: 210,
              ease: "Back.easeOut",
            });
            this.tweens.add({
              targets: [title, description, closeHint],
              alpha: 1,
              duration: 240,
              ease: "Sine.easeOut",
              delay: 80,
            });
          },
        });
      },
    });

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.06, to: 0.18 },
      scaleX: { from: 0.94, to: 1.08 },
      scaleY: { from: 0.94, to: 1.08 },
      duration: 1500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private dismissRoleReveal(immediate = false): void {
    const reveal = this.roleReveal;
    const backdrop = this.roleBackdrop;
    this.roleReveal = undefined;
    this.roleBackdrop = undefined;
    if (!reveal && !backdrop) return;
    if (immediate) {
      reveal?.destroy(true);
      backdrop?.destroy();
      return;
    }
    const { width, height } = this.scale;
    if (reveal) {
      this.tweens.add({
        targets: reveal,
        x: Math.max(72, width * 0.08),
        y: Math.max(90, height - 112),
        scale: 0.18,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeIn",
        onComplete: () => reveal.destroy(true),
      });
    }
    if (backdrop) {
      this.tweens.add({
        targets: backdrop,
        alpha: 0,
        duration: 180,
        ease: "Sine.easeOut",
        onComplete: () => backdrop.destroy(),
      });
    }
  }

  private roleFrontKey(roleId: string): string {
    return `role-card-front-${roleId || "villager"}`;
  }
}
