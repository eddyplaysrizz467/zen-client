package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenFlightScreen extends Screen {
  private final Screen parent;
  private ZenGreenButton modeButton;
  private ZenGreenButton speedButton;

  public ZenFlightScreen(Screen parent) {
    super(Component.literal("Flight Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int centerX = this.width / 2;
    int startY = 78;

    modeButton = addRenderableWidget(
      ZenGreenButton.create(buildModeText(), button -> {
        ZenClientMod.config().cycleFlightMode();
        refreshButtons();
      }, centerX - 110, startY, 220, 20)
    );

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("- Speed"), button -> {
        ZenClientMod.config().adjustFlightSpeed(-0.2D);
        refreshButtons();
      }, centerX - 110, startY + 30, 70, 20)
    );

    speedButton = addRenderableWidget(
      ZenGreenButton.create(buildSpeedText(), button -> {
      }, centerX - 34, startY + 30, 68, 20)
    );
    speedButton.active = false;

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("+ Speed"), button -> {
        ZenClientMod.config().adjustFlightSpeed(0.2D);
        refreshButtons();
      }, centerX + 40, startY + 30, 70, 20)
    );

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("Back"), button -> this.minecraft.setScreen(parent), centerX - 68, this.height - 34, 136, 20)
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
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);
    int panelLeft = (this.width / 2) - 200;
    int panelRight = (this.width / 2) + 200;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);

    super.render(context, mouseX, mouseY, delta);

    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, 28, ZenTheme.WHITE, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("10 flight modes: Vanilla, Drift, Dash, Glide, Hover, Boost, Cruise, Jet, Brake, Swift."), this.width / 2, 48, ZenTheme.TEXT_SOFT, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Speed range: 0.4x to 3.0x"), this.width / 2, 60, 0xFFC7FFC7, 0xFF063711);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
