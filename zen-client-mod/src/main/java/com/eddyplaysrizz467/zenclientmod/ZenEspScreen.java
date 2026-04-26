package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenEspScreen extends Screen {
  private final Screen parent;

  public ZenEspScreen(Screen parent) {
    super(Component.literal("ESP Targets"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int columnWidth = 220;
    int gap = 12;
    int leftX = (this.width / 2) - columnWidth - (gap / 2);
    int rightX = (this.width / 2) + (gap / 2);
    int startY = 68;

    ZenEspTarget[] targets = ZenEspTarget.values();
    for (int i = 0; i < targets.length; i++) {
      ZenEspTarget target = targets[i];
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = startY + (row * 28);

      addRenderableWidget(
        Button.builder(buildButtonText(target), button -> {
          ZenClientMod.config().toggleEspTarget(target);
          button.setMessage(buildButtonText(target));
        }).bounds(x, y, columnWidth, 20).build()
      );
    }

    addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds((this.width / 2) - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  private Component buildButtonText(ZenEspTarget target) {
    boolean enabled = ZenClientMod.config().isEspTargetEnabled(target);
    return Component.literal(target.label() + "  [" + (enabled ? "ON" : "OFF") + "]");
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    this.renderBackground(context, mouseX, mouseY, delta);
    int panelLeft = (this.width / 2) - 250;
    int panelRight = (this.width / 2) + 250;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);
    super.render(context, mouseX, mouseY, delta);
    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(this.font, Component.literal("Choose which entities the ESP highlights"), this.width / 2, 46, 0xFF9E9E9E);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
