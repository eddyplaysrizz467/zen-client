package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenSettingsScreen extends Screen {
  private final Screen parent;

  public ZenSettingsScreen(Screen parent) {
    super(Component.literal("Zen Client Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int columnWidth = 220;
    int gap = 12;
    int leftX = (this.width / 2) - columnWidth - (gap / 2);
    int rightX = (this.width / 2) + (gap / 2);
    int rowHeight = 24;
    int startY = 46;

    ZenFeature[] features = ZenFeature.values();
    for (int i = 0; i < features.length; i++) {
      ZenFeature feature = features[i];
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = startY + (row * rowHeight);

      addRenderableWidget(
        Button.builder(buildButtonText(feature), button -> {
          ZenClientMod.config().toggle(feature);
          button.setMessage(buildButtonText(feature));
        }).bounds(x, y, columnWidth, 20).build()
      );
    }

    addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds((this.width / 2) - 60, this.height - 34, 120, 20)
        .build()
    );
  }

  private Component buildButtonText(ZenFeature feature) {
    String state = ZenClientMod.config().isEnabled(feature) ? "ON" : "OFF";
    return Component.literal(feature.label() + ": " + state);
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    super.render(context, mouseX, mouseY, delta);
    context.drawCenteredString(this.font, this.title, this.width / 2, 16, 0xF3F3F3);
    context.drawCenteredString(this.font, Component.literal("21 PvP/QoL toggles for Zen Client"), this.width / 2, 30, 0x9A9A9A);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
