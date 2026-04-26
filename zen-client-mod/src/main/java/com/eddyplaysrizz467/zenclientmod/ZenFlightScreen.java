package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenFlightScreen extends Screen {
  private final Screen parent;
  private Button modeButton;
  private Button speedButton;

  public ZenFlightScreen(Screen parent) {
    super(Component.literal("Flight Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int centerX = this.width / 2;
    int startY = 78;

    modeButton = addRenderableWidget(
      Button.builder(buildModeText(), button -> {
        ZenClientMod.config().cycleFlightMode();
        refreshButtons();
      }).bounds(centerX - 110, startY, 220, 20).build()
    );

    addRenderableWidget(
      Button.builder(Component.literal("- Speed"), button -> {
        ZenClientMod.config().adjustFlightSpeed(-0.2D);
        refreshButtons();
      }).bounds(centerX - 110, startY + 30, 70, 20).build()
    );

    speedButton = addRenderableWidget(
      Button.builder(buildSpeedText(), button -> {
      }).bounds(centerX - 34, startY + 30, 68, 20).build()
    );
    speedButton.active = false;

    addRenderableWidget(
      Button.builder(Component.literal("+ Speed"), button -> {
        ZenClientMod.config().adjustFlightSpeed(0.2D);
        refreshButtons();
      }).bounds(centerX + 40, startY + 30, 70, 20).build()
    );

    addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds(centerX - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  private Component buildModeText() {
    return Component.literal("Mode: " + ZenClientMod.config().flightMode().label());
  }

  private Component buildSpeedText() {
    return Component.literal(String.format(java.util.Locale.US, "%.1fx", ZenClientMod.config().flightSpeed()));
  }

  private void refreshButtons() {
    modeButton.setMessage(buildModeText());
    speedButton.setMessage(buildSpeedText());
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    this.renderBackground(context, mouseX, mouseY, delta);
    int panelLeft = (this.width / 2) - 200;
    int panelRight = (this.width / 2) + 200;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);

    super.render(context, mouseX, mouseY, delta);

    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(this.font, Component.literal("Vanilla is steady, Drift floats, Dash pushes harder."), this.width / 2, 48, 0xFF9E9E9E);
    context.drawCenteredString(this.font, Component.literal("Speed range: 0.4x to 3.0x"), this.width / 2, 58, 0xFF7FC9FF);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
