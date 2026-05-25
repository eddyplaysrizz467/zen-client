package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenAimAssistScreen extends Screen {
  private final Screen parent;
  private ZenGreenButton rangeButton;
  private ZenGreenButton smoothButton;
  private ZenGreenButton breakButton;

  public ZenAimAssistScreen(Screen parent) {
    super(Component.literal("Aim Assist Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int centerX = this.width / 2;
    int startY = 74;

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("- Range"), button -> {
        ZenClientMod.config().adjustAimAssistRange(-0.5D);
        refreshButtons();
      }, centerX - 110, startY, 70, 20)
    );
    rangeButton = addRenderableWidget(ZenGreenButton.create(rangeText(), button -> {}, centerX - 34, startY, 68, 20));
    rangeButton.active = false;
    addRenderableWidget(
      ZenGreenButton.create(Component.literal("+ Range"), button -> {
        ZenClientMod.config().adjustAimAssistRange(0.5D);
        refreshButtons();
      }, centerX + 40, startY, 70, 20)
    );

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("- Smooth"), button -> {
        ZenClientMod.config().adjustAimAssistSmoothness(-0.02D);
        refreshButtons();
      }, centerX - 110, startY + 30, 70, 20)
    );
    smoothButton = addRenderableWidget(ZenGreenButton.create(smoothText(), button -> {}, centerX - 34, startY + 30, 68, 20));
    smoothButton.active = false;
    addRenderableWidget(
      ZenGreenButton.create(Component.literal("+ Smooth"), button -> {
        ZenClientMod.config().adjustAimAssistSmoothness(0.02D);
        refreshButtons();
      }, centerX + 40, startY + 30, 70, 20)
    );

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("- Break"), button -> {
        ZenClientMod.config().adjustAimAssistBreakSensitivity(-0.5D);
        refreshButtons();
      }, centerX - 110, startY + 60, 70, 20)
    );
    breakButton = addRenderableWidget(ZenGreenButton.create(breakText(), button -> {}, centerX - 34, startY + 60, 68, 20));
    breakButton.active = false;
    addRenderableWidget(
      ZenGreenButton.create(Component.literal("+ Break"), button -> {
        ZenClientMod.config().adjustAimAssistBreakSensitivity(0.5D);
        refreshButtons();
      }, centerX + 40, startY + 60, 70, 20)
    );

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("Back"), button -> this.minecraft.setScreen(parent), centerX - 68, this.height - 34, 136, 20)
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
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);
    int panelLeft = (this.width / 2) - 200;
    int panelRight = (this.width / 2) + 200;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);

    super.render(context, mouseX, mouseY, delta);

    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, 28, ZenTheme.WHITE, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Range = lock distance, Smooth = how softly it tracks."), this.width / 2, 48, ZenTheme.TEXT_SOFT, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Break = mouse movement needed to pause tracking."), this.width / 2, 60, 0xFFC7FFC7, 0xFF063711);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
