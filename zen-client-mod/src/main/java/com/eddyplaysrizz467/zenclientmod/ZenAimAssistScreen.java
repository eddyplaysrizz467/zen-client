package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenAimAssistScreen extends Screen {
  private final Screen parent;
  private Button rangeButton;
  private Button smoothButton;
  private Button breakButton;

  public ZenAimAssistScreen(Screen parent) {
    super(Component.literal("Aim Assist Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int centerX = this.width / 2;
    int startY = 74;

    addRenderableWidget(
      Button.builder(Component.literal("- Range"), button -> {
        ZenClientMod.config().adjustAimAssistRange(-0.5D);
        refreshButtons();
      }).bounds(centerX - 110, startY, 70, 20).build()
    );
    rangeButton = addRenderableWidget(Button.builder(rangeText(), button -> {}).bounds(centerX - 34, startY, 68, 20).build());
    rangeButton.active = false;
    addRenderableWidget(
      Button.builder(Component.literal("+ Range"), button -> {
        ZenClientMod.config().adjustAimAssistRange(0.5D);
        refreshButtons();
      }).bounds(centerX + 40, startY, 70, 20).build()
    );

    addRenderableWidget(
      Button.builder(Component.literal("- Smooth"), button -> {
        ZenClientMod.config().adjustAimAssistSmoothness(-0.02D);
        refreshButtons();
      }).bounds(centerX - 110, startY + 30, 70, 20).build()
    );
    smoothButton = addRenderableWidget(Button.builder(smoothText(), button -> {}).bounds(centerX - 34, startY + 30, 68, 20).build());
    smoothButton.active = false;
    addRenderableWidget(
      Button.builder(Component.literal("+ Smooth"), button -> {
        ZenClientMod.config().adjustAimAssistSmoothness(0.02D);
        refreshButtons();
      }).bounds(centerX + 40, startY + 30, 70, 20).build()
    );

    addRenderableWidget(
      Button.builder(Component.literal("- Break"), button -> {
        ZenClientMod.config().adjustAimAssistBreakSensitivity(-0.5D);
        refreshButtons();
      }).bounds(centerX - 110, startY + 60, 70, 20).build()
    );
    breakButton = addRenderableWidget(Button.builder(breakText(), button -> {}).bounds(centerX - 34, startY + 60, 68, 20).build());
    breakButton.active = false;
    addRenderableWidget(
      Button.builder(Component.literal("+ Break"), button -> {
        ZenClientMod.config().adjustAimAssistBreakSensitivity(0.5D);
        refreshButtons();
      }).bounds(centerX + 40, startY + 60, 70, 20).build()
    );

    addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds(centerX - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  private void refreshButtons() {
    rangeButton.setMessage(rangeText());
    smoothButton.setMessage(smoothText());
    breakButton.setMessage(breakText());
  }

  private Component rangeText() {
    return Component.literal(String.format(java.util.Locale.US, "%.1f", ZenClientMod.config().aimAssistRange()));
  }

  private Component smoothText() {
    return Component.literal(String.format(java.util.Locale.US, "%.2f", ZenClientMod.config().aimAssistSmoothness()));
  }

  private Component breakText() {
    return Component.literal(String.format(java.util.Locale.US, "%.1f", ZenClientMod.config().aimAssistBreakSensitivity()));
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    int panelLeft = (this.width / 2) - 200;
    int panelRight = (this.width / 2) + 200;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);

    super.render(context, mouseX, mouseY, delta);

    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(this.font, Component.literal("Range = lock distance, Smooth = how softly it tracks."), this.width / 2, 48, 0xFF9E9E9E);
    context.drawCenteredString(this.font, Component.literal("Break = how hard you move the mouse to cancel tracking for 1 second."), this.width / 2, 60, 0xFF7FC9FF);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
